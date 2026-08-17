import React, { useEffect, useRef } from 'react';
import '../styles/portrait-surface.css';

export interface PortraitSurfaceProps {
  title: string;
  titleId: string;
  backLabel: string;
  onBack: () => void;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  navigation?: React.ReactNode;
  footer?: React.ReactNode;
  contentLabel?: string;
  className?: string;
  children: React.ReactNode;
}

export function PortraitSurface({
  title,
  titleId,
  backLabel,
  onBack,
  subtitle,
  headerActions,
  navigation,
  footer,
  contentLabel,
  className = '',
  children,
}: PortraitSurfaceProps): React.ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      className={'ff-portrait-surface ' + className}
      aria-labelledby={titleId}
    >
      <header className="ff-portrait-surface__header">
        <button
          type="button"
          className="ff-portrait-surface__back"
          onClick={onBack}
          aria-label={backLabel}
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
          >
            <path
              d="m12.5 4.5-5 5.5 5 5.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="ff-portrait-surface__heading">
          <h1 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h1>
          {subtitle && <div className="ff-portrait-surface__subtitle">{subtitle}</div>}
        </div>
        {headerActions && (
          <div className="ff-portrait-surface__header-actions">{headerActions}</div>
        )}
      </header>
      {navigation && (
        <div className="ff-portrait-surface__navigation">{navigation}</div>
      )}
      <div
        className="ff-portrait-surface__scroller"
        role="region"
        aria-label={contentLabel}
        tabIndex={0}
      >
        {children}
      </div>
      {footer && <footer className="ff-portrait-surface__footer">{footer}</footer>}
    </section>
  );
}
