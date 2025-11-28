'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface InfoTooltipProps {
  /** The tooltip content - can be plain text or JSX */
  content: React.ReactNode;
  /** Optional custom class for the icon button */
  className?: string;
}

/**
 * InfoTooltip - A small info icon that shows a tooltip on hover/click
 * 
 * Uses a floating tooltip positioned to avoid viewport overflow.
 * Accessible with keyboard navigation and screen readers.
 */
export default function InfoTooltip({ content, className = '' }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Calculate optimal position based on viewport
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    
    // Prefer showing above, but flip if not enough space
    setPosition(spaceAbove > 150 || spaceAbove > spaceBelow ? 'top' : 'bottom');
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
  };

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold
                   text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50
                   hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                   dark:focus:ring-offset-gray-800 transition-colors cursor-help
                   border border-blue-300 dark:border-blue-700"
        aria-label="More information"
        aria-expanded={isOpen}
        aria-describedby={isOpen ? 'tooltip-content' : undefined}
      >
        ?
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          id="tooltip-content"
          role="tooltip"
          style={{ zIndex: 9999 }}
          className={`absolute w-64 p-3 text-sm text-gray-700 dark:text-gray-200
                      bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                      rounded-lg shadow-xl
                      ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
                      left-1/2 -translate-x-1/2`}
        >
          {/* Arrow */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45
                        bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600
                        ${position === 'top'
                          ? 'top-full -mt-1 border-b border-r'
                          : 'bottom-full -mb-1 border-t border-l'}`}
          />
          {content}
        </div>
      )}
    </span>
  );
}

