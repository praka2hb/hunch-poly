'use client';

import * as React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaOptionsType, EmblaCarouselType, EmblaPluginType } from 'embla-carousel';
import { cn } from '@/lib/utils';

type CarouselApi = EmblaCarouselType;
type CarouselOptions = EmblaOptionsType;
type CarouselPlugin = EmblaPluginType;

const CarouselContext = React.createContext<{ api: CarouselApi | undefined }>({
  api: undefined,
});

function useCarousel() {
  const context = React.useContext(CarouselContext);
  if (!context) {
    throw new Error('useCarousel must be used within a Carousel');
  }
  return context;
}

interface CarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin[];
  setApi?: (api: CarouselApi) => void;
}

const Carousel = React.forwardRef<HTMLDivElement, CarouselProps>(
  ({ className, children, opts, plugins, setApi, ...props }, ref) => {
    const [carouselRef, api] = useEmblaCarousel(opts, plugins);

    React.useEffect(() => {
      if (api && setApi) {
        setApi(api);
      }
    }, [api, setApi]);

    return (
      <CarouselContext.Provider value={{ api }}>
        <div ref={ref} className={cn('relative', className)} {...props}>
          <div ref={carouselRef} className="overflow-hidden">
            {children}
          </div>
        </div>
      </CarouselContext.Provider>
    );
  }
);
Carousel.displayName = 'Carousel';

const CarouselContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex -ml-4', className)}
    {...props}
    role="list"
    aria-roledescription="carousel"
  />
));
CarouselContent.displayName = 'CarouselContent';

const CarouselItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div ref={ref} className={cn('min-w-0 shrink-0 grow-0 basis-full pl-4', className)} {...props} role="group" aria-roledescription="slide" />
  );
});
CarouselItem.displayName = 'CarouselItem';

const CarouselPrevious = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const { api } = useCarousel();
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'absolute left-2 top-1/2 z-10 -translate-y-1/2 px-3 py-2 text-2xl font-bold text-[var(--text-primary)] transition focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      onClick={() => api?.scrollPrev()}
      aria-label="Previous slide"
      {...props}
    >
      ‹
    </button>
  );
});
CarouselPrevious.displayName = 'CarouselPrevious';

const CarouselNext = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const { api } = useCarousel();
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'absolute right-2 top-1/2 z-10 -translate-y-1/2 px-3 py-2 text-2xl font-bold text-[var(--text-primary)] transition focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      onClick={() => api?.scrollNext()}
      aria-label="Next slide"
      {...props}
    >
      ›
    </button>
  );
});
CarouselNext.displayName = 'CarouselNext';

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
};

