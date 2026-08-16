/**
 * MarkuprX - Animation Hooks
 *
 * Programmatic animation utilities for React components.
 * Provides hooks for staggered animations, spring physics,
 * and animation lifecycle management.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface AnimationConfig {
  duration?: number;
  delay?: number;
  easing?: string;
  fill?: 'none' | 'forwards' | 'backwards' | 'both';
}

export interface StaggerConfig extends AnimationConfig {
  baseDelay?: number;
  staggerDelay?: number;
}

export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export interface AnimatedItem<T> {
  item: T;
  style: React.CSSProperties;
  className?: string;
  index: number;
}

export type AnimationState = 'idle' | 'entering' | 'entered' | 'exiting' | 'exited';

// ============================================================================
// CSS Variables for Spring Physics
// ============================================================================

// Pre-computed spring curves for common presets
export const SPRING_PRESETS = {
  // Bouncy, playful feel
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  // Smooth, professional feel
  smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
  // Quick snap
  snap: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  // Gentle ease
  gentle: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  // Standard ease out
  easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
} as const;

// ============================================================================
// useStaggeredAnimation Hook
// ============================================================================

/**
 * Creates staggered animation styles for a list of items.
 * Each item receives a progressively delayed animation.
 *
 * @example
 * const animatedItems = useStaggeredAnimation(items, {
 *   baseDelay: 100,
 *   staggerDelay: 50,
 * });
 *
 * return animatedItems.map(({ item, style, index }) => (
 *   <div key={index} style={style} className="ff-list-item-enter">
 *     {item.name}
 *   </div>
 * ));
 */
export function useStaggeredAnimation<T>(
  items: T[],
  config: StaggerConfig = {}
): AnimatedItem<T>[] {
  const {
    baseDelay = 0,
    staggerDelay = 50,
    duration = 250,
    easing = SPRING_PRESETS.smooth,
    fill = 'both',
  } = config;

  return useMemo(() => {
    return items.map((item, index) => ({
      item,
      index,
      style: {
        animationDelay: `${baseDelay + index * staggerDelay}ms`,
        animationDuration: `${duration}ms`,
        animationTimingFunction: easing,
        animationFillMode: fill,
      },
      className: 'ff-list-item-enter',
    }));
  }, [items, baseDelay, staggerDelay, duration, easing, fill]);
}

// ============================================================================
// useAnimationState Hook
// ============================================================================

/**
 * Manages enter/exit animation lifecycle.
 * Useful for components that need to animate out before unmounting.
 *
 * @example
 * const { state, triggerEnter, triggerExit, shouldRender } = useAnimationState({
 *   isVisible: props.open,
 *   enterDuration: 250,
 *   exitDuration: 150,
 * });
 *
 * if (!shouldRender) return null;
 *
 * return (
 *   <div className={state === 'entering' ? 'ff-dialog-enter' : 'ff-dialog-exit'}>
 *     ...
 *   </div>
 * );
 */
export function useAnimationState(config: {
  isVisible: boolean;
  enterDuration?: number;
  exitDuration?: number;
  onEntered?: () => void;
  onExited?: () => void;
}) {
  const {
    isVisible,
    enterDuration = 250,
    exitDuration = 150,
    onEntered,
    onExited,
  } = config;

  const [state, setState] = useState<AnimationState>(isVisible ? 'entered' : 'exited');
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (isVisible) {
      setState('entering');
      timeoutRef.current = setTimeout(() => {
        setState('entered');
        onEntered?.();
      }, enterDuration);
    } else if (state !== 'exited') {
      setState('exiting');
      timeoutRef.current = setTimeout(() => {
        setState('exited');
        onExited?.();
      }, exitDuration);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isVisible, enterDuration, exitDuration, onEntered, onExited, state]);

  const triggerEnter = useCallback(() => {
    setState('entering');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setState('entered');
      onEntered?.();
    }, enterDuration);
  }, [enterDuration, onEntered]);

  const triggerExit = useCallback(() => {
    setState('exiting');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setState('exited');
      onExited?.();
    }, exitDuration);
  }, [exitDuration, onExited]);

  return {
    state,
    isEntering: state === 'entering',
    isEntered: state === 'entered',
    isExiting: state === 'exiting',
    isExited: state === 'exited',
    shouldRender: state !== 'exited',
    triggerEnter,
    triggerExit,
  };
}

// ============================================================================
// useCountAnimation Hook
// ============================================================================

/**
 * Animates a number counting up or down.
 *
 * @example
 * const { displayValue, isAnimating } = useCountAnimation(totalItems, {
 *   duration: 500,
 * });
 *
 * return <span className={isAnimating ? 'ff-counter-increment' : ''}>{displayValue}</span>;
 */
export function useCountAnimation(
  targetValue: number,
  config: { duration?: number; startValue?: number } = {}
) {
  const { duration = 300, startValue } = config;
  const [displayValue, setDisplayValue] = useState(startValue ?? targetValue);
  const [isAnimating, setIsAnimating] = useState(false);
  const previousValueRef = useRef(targetValue);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (targetValue === previousValueRef.current) return;

    const startVal = previousValueRef.current;
    const diff = targetValue - startVal;
    const startTime = performance.now();

    setIsAnimating(true);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(startVal + diff * eased);

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        previousValueRef.current = targetValue;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration]);

  return { displayValue, isAnimating };
}

// ============================================================================
// usePulse Hook
// ============================================================================

/**
 * Triggers a one-shot pulse animation.
 *
 * @example
 * const { isPulsing, triggerPulse, pulseClassName } = usePulse();
 *
 * <button onClick={() => { save(); triggerPulse(); }} className={pulseClassName}>
 *   Save
 * </button>
 */
export function usePulse(duration = 300) {
  const [isPulsing, setIsPulsing] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const triggerPulse = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsPulsing(true);
    timeoutRef.current = setTimeout(() => {
      setIsPulsing(false);
    }, duration);
  }, [duration]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isPulsing,
    triggerPulse,
    pulseClassName: isPulsing ? 'ff-success-pulse' : '',
  };
}

// ============================================================================
// useShake Hook
// ============================================================================

/**
 * Triggers a shake animation for error feedback.
 *
 * @example
 * const { isShaking, triggerShake, shakeClassName } = useShake();
 *
 * if (hasError) {
 *   triggerShake();
 * }
 *
 * return <div className={shakeClassName}>...</div>;
 */
export function useShake(duration = 500) {
  const [isShaking, setIsShaking] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const triggerShake = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsShaking(true);
    timeoutRef.current = setTimeout(() => {
      setIsShaking(false);
    }, duration);
  }, [duration]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isShaking,
    triggerShake,
    shakeClassName: isShaking ? 'ff-error-shake' : '',
  };
}

// ============================================================================
// useRipple Hook
// ============================================================================

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

/**
 * Creates material-design style ripple effects on click.
 *
 * @example
 * const { ripples, createRipple, RippleContainer } = useRipple();
 *
 * return (
 *   <button onClick={createRipple} style={{ position: 'relative', overflow: 'hidden' }}>
 *     Click me
 *     <RippleContainer />
 *   </button>
 * );
 */
export function useRipple(duration = 600) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextIdRef = useRef(0);

  const createRipple = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();

      const size = Math.max(rect.width, rect.height) * 2;
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;

      const newRipple: Ripple = {
        id: nextIdRef.current++,
        x,
        y,
        size,
      };

      setRipples((prev) => [...prev, newRipple]);

      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, duration);
    },
    [duration]
  );

  const RippleContainer: React.FC = () => (
    <>
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="ff-ripple"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
          }}
        />
      ))}
    </>
  );

  return { ripples, createRipple, RippleContainer };
}

// ============================================================================
// useDelayedRender Hook
// ============================================================================

/**
 * Delays rendering of children to create staggered mount effects.
 *
 * @example
 * const shouldRender = useDelayedRender(300);
 *
 * return shouldRender ? <HeavyComponent /> : <Skeleton />;
 */
export function useDelayedRender(delay: number, initialValue = false): boolean {
  const [shouldRender, setShouldRender] = useState(initialValue);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShouldRender(true);
    }, delay);

    return () => clearTimeout(timeout);
  }, [delay]);

  return shouldRender;
}

// ============================================================================
// useAnimatedValue Hook
// ============================================================================

/**
 * Animates a value from one number to another using requestAnimationFrame.
 * Returns current interpolated value.
 *
 * @example
 * const animatedHeight = useAnimatedValue(isExpanded ? 300 : 0, { duration: 300 });
 *
 * return <div style={{ height: animatedHeight }}>...</div>;
 */
export function useAnimatedValue(
  targetValue: number,
  config: { duration?: number; easing?: (t: number) => number } = {}
): number {
  const { duration = 300, easing = (t) => 1 - Math.pow(1 - t, 3) } = config;

  const [currentValue, setCurrentValue] = useState(targetValue);
  const startValueRef = useRef(targetValue);
  const startTimeRef = useRef<number | null>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (currentValue === targetValue) return;

    startValueRef.current = currentValue;
    startTimeRef.current = null;

    const animate = (time: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = time;
      }

      const elapsed = time - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easing(progress);

      const newValue =
        startValueRef.current + (targetValue - startValueRef.current) * easedProgress;

      setCurrentValue(newValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration, easing, currentValue]);

  return currentValue;
}

// ============================================================================
// useReducedMotion Hook
// ============================================================================

/**
 * Detects user's reduced motion preference.
 *
 * @example
 * const prefersReducedMotion = useReducedMotion();
 *
 * const animationDuration = prefersReducedMotion ? 0 : 300;
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}
