import amqplib from 'amqplib';
import config from '../config/index.js';
import { createLogger } from './logger.js';

const log = createLogger('rabbit');

let connection = null;
let publishChannel = null;

async function getConnection() {
  if (connection) return connection;
  connection = await amqplib.connect(config.rabbit.url);
  connection.on('error', (err) => log.error('connection error:', err.message));
  connection.on('close', () => {
    log.warn('connection closed');
    connection = null;
    publishChannel = null;
  });
  log.info(`connected ${config.rabbit.url}`);
  return connection;
}

/**
 * Asserts the topology used for non-blocking retry/backoff:
 *
 *   {vendor}.leads        durable work queue (consumed by consumer.js)
 *   {vendor}.leads.retry  holding queue; messages sit here for `expiration` ms,
 *                         then dead-letter back to the main queue (default exchange).
 *   {vendor}.leads.dlq    parking lot for messages that exhaust MAX_ATTEMPTS.
 *
 * Backoff is per-message (we set `expiration` when publishing to the retry queue),
 * so a slow lead never blocks the consumer channel.
 */
export async function assertTopology(channel) {
  const { queue, retryQueue, dlq } = config.rabbit;
  await channel.assertQueue(queue, { durable: true });
  await channel.assertQueue(dlq, { durable: true });
  await channel.assertQueue(retryQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '', // default exchange
      'x-dead-letter-routing-key': queue, // expired -> back to main queue
    },
  });
  return { queue, retryQueue, dlq };
}

/** A shared confirm-less channel for publishing (producer + retry republish). */
export async function getPublishChannel() {
  if (publishChannel) return publishChannel;
  const conn = await getConnection();
  publishChannel = await conn.createChannel();
  await assertTopology(publishChannel);
  publishChannel.on('close', () => { publishChannel = null; });
  return publishChannel;
}

/** Dedicated channel for the consumer (so prefetch is isolated). */
export async function createConsumerChannel() {
  const conn = await getConnection();
  const channel = await conn.createChannel();
  await assertTopology(channel);
  await channel.prefetch(config.rabbit.prefetch);
  return channel;
}

export function publishLead(channel, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  return channel.sendToQueue(config.rabbit.queue, body, {
    persistent: true,
    contentType: 'application/json',
  });
}

/** Republish a message into the retry queue with a per-message backoff delay. */
export function scheduleRetry(channel, payload, { attempts, delayMs }) {
  const body = Buffer.from(JSON.stringify(payload));
  return channel.sendToQueue(config.rabbit.retryQueue, body, {
    persistent: true,
    contentType: 'application/json',
    expiration: String(delayMs),
    headers: { 'x-attempts': attempts },
  });
}

/** Send a permanently-failed message to the dead-letter parking queue. */
export function sendToDlq(channel, payload, reason) {
  const body = Buffer.from(JSON.stringify({ ...payload, _dlqReason: reason }));
  return channel.sendToQueue(config.rabbit.dlq, body, {
    persistent: true,
    contentType: 'application/json',
  });
}

export async function closeRabbit() {
  try {
    if (publishChannel) await publishChannel.close();
    if (connection) await connection.close();
  } catch (err) {
    log.warn('error during close:', err.message);
  } finally {
    publishChannel = null;
    connection = null;
  }
}
