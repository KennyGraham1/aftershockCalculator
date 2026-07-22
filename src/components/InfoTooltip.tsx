'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';

interface InfoTooltipProps {
  /** The tooltip content - can be plain text or JSX */
  content: React.ReactNode;
  /** Optional custom class for the icon button */
  className?: string;
}

const TOOLTIP_WIDTH = 256; // matches w-64
const VIEWPORT_MARGIN = 8;

interface TooltipPosition {
  top: number;
  left: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
}

/**
 * InfoTooltip - A small info icon that shows a tooltip on hover/click
 *
 * The tooltip is rendered in a document-body portal with viewport-fixed
 * positioning, so it is never clipped by scrollable or overflow-hidden
 * ancestors (e.g. horizontally scrolling tables).
 * Accessible with keyboard navigation and screen readers.
 */
export default function InfoTooltip({ content, className = '' }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<TooltipPosition>({ top: 0, left: 0, arrowLeft: TOOLTIP_WIDTH / 2, placement: 'top' });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  // Compute a viewport-fixed position anchored to the button
  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: 'top' | 'bottom' = spaceAbove > 180 || spaceAbove > spaceBelow ? 'top' : 'bottom';

    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN));
    const top = placement === 'top' ? rect.top - 8 : rect.bottom + 8;
    const arrowLeft = rect.left + rect.width / 2 - left;

    setPos({ top, left, arrowLeft, placement });
  }, []);

  // Close on outside click / Escape; keep the position current while open
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
    // Capture-phase scroll listener also catches scrolling containers
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

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
        aria-describedby={isOpen ? tooltipId : undefined}
      >
        ?
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: TOOLTIP_WIDTH,
            zIndex: 9999,
            transform: pos.placement === 'top' ? 'translateY(-100%)' : undefined,
          }}
          className="p-3 text-sm text-gray-700 dark:text-gray-200
                     bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                     rounded-lg shadow-xl"
        >
          {/* Arrow, kept aligned with the button even when the box is clamped
              to the viewport edge */}
          <div
            style={{ left: pos.arrowLeft }}
            className={`absolute -translate-x-1/2 w-2 h-2 rotate-45
                        bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600
                        ${pos.placement === 'top'
                          ? 'top-full -mt-1 border-b border-r'
                          : 'bottom-full -mb-1 border-t border-l'}`}
          />
          {content}
        </div>,
        document.body
      )}
    </span>
  );
}
