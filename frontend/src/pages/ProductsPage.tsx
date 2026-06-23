import { useNavigate } from 'react-router-dom';
import { Box, Button, Flex, Heading, Stack, Text, SimpleGrid, Icon } from '@chakra-ui/react';
import { FiCreditCard, FiBriefcase, FiHome, FiArrowRight } from 'react-icons/fi';
import { useAuth } from '@/auth/AuthContext';
import { PRODUCTS, type ProductKey } from '@/api/upload';

const ICONS: Record<ProductKey, typeof FiCreditCard> = {
  personal: FiCreditCard,
  gold: FiBriefcase,
  housing: FiHome,
};

/**
 * Landing page after login: choose which lender product to push leads to.
 * Selecting one navigates to the upload form for that product.
 */
export default function ProductsPage() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Box minH="100vh" bg="gray.100" py={12} px={4}>
      <Box maxW="760px" mx="auto">
        <Flex justify="space-between" align="center" mb={8}>
          <Box>
            <Heading size="lg">Choose a product</Heading>
            <Text color="gray.500" fontSize="sm">
              Signed in as {username} — pick where these leads should be pushed
            </Text>
          </Box>
          <Button variant="outline" size="sm" onClick={logout}>
            Sign out
          </Button>
        </Flex>

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={5}>
          {PRODUCTS.map((p) => {
            const ProductIcon = ICONS[p.key];
            return (
              <Box
                key={p.key}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/upload/${p.key}`)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/upload/${p.key}`)}
                bg="white"
                borderWidth="2px"
                borderColor="gray.200"
                borderRadius="xl"
                p={6}
                cursor="pointer"
                transition="all 0.15s"
                _hover={{ borderColor: 'blue.400', boxShadow: 'md', transform: 'translateY(-2px)' }}
              >
                <Stack gap={3} h="full">
                  <Icon as={ProductIcon} boxSize={8} color="blue.500" />
                  <Heading size="md">{p.label}</Heading>
                  <Text fontSize="sm" color="gray.500" flex="1">
                    {p.description}
                  </Text>
                  <Flex align="center" color="blue.600" fontWeight="medium" fontSize="sm">
                    Upload leads <Icon as={FiArrowRight} ml={1} />
                  </Flex>
                </Stack>
              </Box>
            );
          })}
        </SimpleGrid>
      </Box>
    </Box>
  );
}
