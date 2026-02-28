'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LayoutContent({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent hydration mismatch by not applying conditional class until mounted
    if (!mounted) {
        return <div>{children}</div>;
    }

    // Apply padding on all pages except the root login redirect page
    const shouldApplyPadding = pathname !== '/';

    return (
        <div className={shouldApplyPadding ? 'md:pl-24' : ''}>
            {children}
        </div>
    );
}
