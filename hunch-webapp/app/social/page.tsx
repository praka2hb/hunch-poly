'use client';

import { usePrivy } from '@privy-io/react-auth';
import SocialFeed from '../components/SocialFeed';
import SuggestedProfiles from '../components/SuggestedProfiles';

export default function SocialPage() {
  const { ready } = usePrivy();

  // Show loading while Privy initializes
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)] text-sm">Initializing...</p>
        </div>
      </div>
    );
  }

  // Show social feed - accessible to both authenticated and unauthenticated users
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Feed Section */}
          <section className="lg:col-span-2">
          <SocialFeed />
        </section>

          {/* Suggested Profiles Sidebar */}
          <aside className="lg:col-span-1 hidden lg:block">
            <div className="sticky top-6">
              <SuggestedProfiles />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
