'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter, useParams } from 'next/navigation';
import UserProfileView from '../../components/UserProfileView';

export default function UserPage() {
    const { ready, authenticated } = usePrivy();
    const router = useRouter();
    const params = useParams();
    const username = params.username as string;
    const [userId, setUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch user by username to get userId
    useEffect(() => {
        const fetchUser = async () => {
            if (!username) return;
            
            setLoading(true);
            setError(null);
            
            try {
                const response = await fetch(`/api/users/by-username/${encodeURIComponent(username)}`);
                if (!response.ok) {
                    if (response.status === 404) {
                        setError('User not found');
                    } else {
                        setError('Failed to load user');
                    }
                    setLoading(false);
                    return;
                }
                
                const user = await response.json();
                setUserId(user.id);
            } catch (err) {
                console.error('Error fetching user:', err);
                setError('Failed to load user');
            } finally {
                setLoading(false);
            }
        };

        if (username) {
            fetchUser();
        }
    }, [username]);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (ready && !authenticated) {
            router.push('/');
        }
    }, [ready, authenticated, router]);

    // Show loading while Privy initializes
    if (!ready) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[var(--text-secondary)] text-sm">Initializing...</p>
                </div>
            </div>
        );
    }

    // Show loading while redirecting if not authenticated
    if (!authenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[var(--text-secondary)] text-sm">Redirecting...</p>
                </div>
            </div>
        );
    }

    // Show loading while fetching user
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[var(--text-secondary)] text-sm">Loading profile...</p>
                </div>
            </div>
        );
    }

    // Show error if user not found
    if (error || !userId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <div className="text-center px-6">
                    <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">User Not Found</h2>
                    <p className="text-[var(--text-secondary)] mb-6">{error || 'The user you are looking for does not exist.'}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-3 bg-gradient-to-r from-yellow-600 to-teal-600 hover:from-yellow-500 hover:to-teal-500 text-white rounded-xl font-semibold transition-all"
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--background)]">
            <main className="w-full px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
                <UserProfileView userId={userId} />
            </main>
        </div>
    );
}
