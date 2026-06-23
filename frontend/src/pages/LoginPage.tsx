import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Button, Heading, Input, Stack, Text } from '@chakra-ui/react';
import { useAuth } from '@/auth/AuthContext';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  if (isAuthenticated) {
    navigate(from, { replace: true });
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (login(username.trim(), password)) {
      navigate(from, { replace: true });
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" bg="gray.100">
      <Box bg="white" p={8} borderRadius="xl" boxShadow="lg" w="full" maxW="380px">
        <Stack gap={5} as="form" onSubmit={onSubmit}>
          <Box>
            <Heading size="lg">Lead Pusher</Heading>
            <Text color="gray.500" fontSize="sm">
              Sign in to upload lead batches
            </Text>
          </Box>

          {error && (
            <Box bg="red.50" color="red.700" px={3} py={2} borderRadius="md" fontSize="sm">
              {error}
            </Box>
          )}

          <Stack gap={1}>
            <Text fontSize="sm" fontWeight="medium">
              Username
            </Text>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoFocus />
          </Stack>

          <Stack gap={1}>
            <Text fontSize="sm" fontWeight="medium">
              Password
            </Text>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Stack>

          <Button type="submit" colorPalette="blue" disabled={!username || !password}>
            Sign in
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
