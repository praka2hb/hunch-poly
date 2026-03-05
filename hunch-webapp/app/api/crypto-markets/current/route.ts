// Re-export the GET handler from the parent crypto-markets route
// The mobile app calls /api/crypto-markets/current, so this route bridges that path.
export { GET } from '../route';
