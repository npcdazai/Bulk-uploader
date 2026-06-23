import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Stack,
  Text,
  SimpleGrid,
} from '@chakra-ui/react';
import Dropzone from '@/components/Dropzone';
import { useAuth } from '@/auth/AuthContext';
import { uploadLeads, type HeaderValidationError, type UploadSuccess } from '@/api/upload';

interface FormValues {
  batchSize: number;
  delayBetweenBatches: number;
  file: File | null;
}

const schema: yup.ObjectSchema<FormValues> = yup.object({
  batchSize: yup
    .number()
    .typeError('Enter a number')
    .required('Required')
    .integer('Whole number')
    .min(1, 'Min 1')
    .max(100000, 'Max 100000'),
  delayBetweenBatches: yup
    .number()
    .typeError('Enter a number')
    .required('Required')
    .integer('Whole number')
    .min(0, 'Min 0')
    .max(600000, 'Max 600000'),
  file: yup
    .mixed<File>()
    .required('Please choose an .xlsx file')
    .test('ext', 'File must be .xlsx', (f) => !!f && /\.xlsx$/i.test((f as File).name)),
});

export default function UploadPage() {
  const { username, logout } = useAuth();
  const [success, setSuccess] = useState<UploadSuccess | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validation, setValidation] = useState<HeaderValidationError | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { batchSize: 100, delayBetweenBatches: 1000, file: null },
  });

  // file is held in RHF state; the Dropzone is the controlled editor for it.
  register('file');
  const file = watch('file');

  const onSubmit = async (values: FormValues) => {
    setSuccess(null);
    setErrorMsg(null);
    setValidation(null);
    try {
      const res = await uploadLeads({
        file: values.file as File,
        batchSize: values.batchSize,
        delayBetweenBatches: values.delayBetweenBatches,
      });
      setSuccess(res);
      reset({ batchSize: values.batchSize, delayBetweenBatches: values.delayBetweenBatches, file: null });
    } catch (err) {
      const failure = err as { message: string; validation?: HeaderValidationError };
      setErrorMsg(failure.message);
      setValidation(failure.validation ?? null);
    }
  };

  return (
    <Box minH="100vh" bg="gray.100" py={10} px={4}>
      <Box maxW="640px" mx="auto">
        <Flex justify="space-between" align="center" mb={6}>
          <Box>
            <Heading size="lg">Upload Leads</Heading>
            <Text color="gray.500" fontSize="sm">
              Signed in as {username}
            </Text>
          </Box>
          <Button variant="outline" size="sm" onClick={logout}>
            Sign out
          </Button>
        </Flex>

        <Box bg="white" p={6} borderRadius="xl" boxShadow="sm">
          <Stack gap={5} as="form" onSubmit={handleSubmit(onSubmit)}>
            <SimpleGrid columns={{ base: 1, sm: 2 }} gap={4}>
              <Field label="Batch Size" error={errors.batchSize?.message} hint="Leads per batch before the delay">
                <Input type="number" {...register('batchSize')} />
              </Field>
              <Field
                label="Delay Between Batches (ms)"
                error={errors.delayBetweenBatches?.message}
                hint="Pause after each batch"
              >
                <Input type="number" {...register('delayBetweenBatches')} />
              </Field>
            </SimpleGrid>

            <Field label="Leads File (.xlsx)" error={errors.file?.message as string | undefined}>
              <Dropzone
                file={file}
                invalid={Boolean(errors.file)}
                onFile={(f) => {
                  setValue('file', f, { shouldValidate: true, shouldDirty: true });
                  void trigger('file');
                }}
              />
            </Field>

            {success && (
              <Alert tone="success" title="Upload accepted">
                <Text fontSize="sm">
                  Stored as <code>{success.key}</code>. The pipeline will process it with batch size{' '}
                  {success.batchSize} and {success.delayBetweenBatches}ms delay.
                </Text>
                <Text fontSize="sm" mt={1}>
                  URL:{' '}
                  <a href={success.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                    {success.url}
                  </a>
                </Text>
              </Alert>
            )}

            {errorMsg && (
              <Alert tone="error" title={errorMsg}>
                {validation && (
                  <Stack gap={1} mt={1} fontSize="sm">
                    <Text>
                      <b>Missing:</b> {validation.missingHeaders.join(', ')}
                    </Text>
                    <Text color="red.700">
                      <b>Required:</b> {validation.requiredHeaders.join(', ')}
                    </Text>
                    <Text color="gray.600">
                      <b>Found in file:</b> {validation.uploadedHeaders.join(', ') || '(none)'}
                    </Text>
                  </Stack>
                )}
              </Alert>
            )}

            <Button type="submit" colorPalette="blue" loading={isSubmitting} loadingText="Uploading…">
              Upload &amp; Queue
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

/** Small labelled-field wrapper to keep the form markup tidy. */
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap={1}>
      <Text fontSize="sm" fontWeight="medium">
        {label}
      </Text>
      {children}
      {error ? (
        <Text fontSize="xs" color="red.500">
          {error}
        </Text>
      ) : hint ? (
        <Text fontSize="xs" color="gray.500">
          {hint}
        </Text>
      ) : null}
    </Stack>
  );
}

/** Inline alert box (avoids depending on a specific Chakra v3 Alert API surface). */
function Alert({
  tone,
  title,
  children,
}: {
  tone: 'success' | 'error';
  title: string;
  children?: React.ReactNode;
}) {
  const colors = tone === 'success' ? { bg: 'green.50', fg: 'green.800' } : { bg: 'red.50', fg: 'red.800' };
  return (
    <Box bg={colors.bg} color={colors.fg} borderRadius="md" px={4} py={3}>
      <Text fontWeight="semibold">{title}</Text>
      {children}
    </Box>
  );
}
