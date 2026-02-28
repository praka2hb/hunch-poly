'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import LoginModal from './LoginModal';

interface AuthContextType {
  /** 
   * Call this to require authentication. 
   * If not authenticated, shows login modal.
   * Returns true if already authenticated, false if modal was shown.
   */
  requireAuth: (message?: string) => boolean;
  /** Check if user is authenticated */
  isAuthenticated: boolean;
  /** Show the login modal manually */
  showLoginModal: (message?: string) => void;
  /** Hide the login modal */
  hideLoginModal: () => void;
  /** Check if login modal is open */
  isLoginModalOpen: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { authenticated, user, ready } = usePrivy();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | undefined>();

  // Console log Privy user data when authenticated
  useEffect(() => {
    if (ready && authenticated && user) {
      console.log('=== Privy Authentication Data ===');
      console.log('User object:', user);
      console.log('User ID:', user.id);
      console.log('Email:', user.email);
      console.log('Linked Accounts:', user.linkedAccounts);
      console.log('Twitter:', user.twitter);
      console.log('Google:', user.google);
      console.log('Wallet:', user.wallet);
      console.log('Full user object (JSON):', JSON.stringify(user, null, 2));
      console.log('================================');
    }
  }, [ready, authenticated, user]);

  const showLoginModal = useCallback((message?: string) => {
    setModalMessage(message);
    setIsModalOpen(true);
  }, []);

  const hideLoginModal = useCallback(() => {
    setIsModalOpen(false);
    setModalMessage(undefined);
  }, []);

  const requireAuth = useCallback((message?: string): boolean => {
    if (authenticated) {
      return true;
    }
    showLoginModal(message);
    return false;
  }, [authenticated, showLoginModal]);

  return (
    <AuthContext.Provider
      value={{
        requireAuth,
        isAuthenticated: authenticated,
        showLoginModal,
        hideLoginModal,
        isLoginModalOpen: isModalOpen,
      }}
    >
      {children}
      <LoginModal
        isOpen={isModalOpen}
        onClose={hideLoginModal}
        message={modalMessage}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
