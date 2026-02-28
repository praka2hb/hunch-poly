import { setAccessTokenGetter } from '@/lib/api';
import { usePrivy } from '@privy-io/expo';
import { useEffect } from 'react';

/**
 * AuthInitializer component
 * 
 * This component initializes the API module with the Privy access token getter.
 * It should be placed inside the PrivyProvider in the app layout.
 */
export function AuthInitializer({ children }: { children: React.ReactNode }) {
    const { getAccessToken } = usePrivy();

    useEffect(() => {
        // Set up the access token getter for the API module
        setAccessTokenGetter(async () => {
            try {
                const token = await getAccessToken();
                return token;
            } catch (error) {
                console.error('[AuthInitializer] Failed to get access token:', error);
                return null;
            }
        });
    }, [getAccessToken]);

    return <>{children}</>;
}
