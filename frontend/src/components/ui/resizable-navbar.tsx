import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from 'framer-motion';
import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/utils/cn';

/**
 * A port of Aceternity UI's "Resizable Navbar" (https://ui.aceternity.com),
 * adapted from its original Next.js form for this app's stack: React
 * Router's `Link` in place of `next/link` (every nav destination here is a
 * real in-app route, so there's no `<a>`/anchor-link case to support),
 * this app's own `--background`/`--foreground`/`--primary`/`--secondary`
 * design tokens (Phase 1 § 17) in place of the original's hardcoded
 * zinc/neutral palette, and two inline SVGs for the mobile menu toggle
 * instead of pulling in `@tabler/icons-react` for two glyphs. The
 * scroll-linked shrink/blur behavior and the hover-highlight pill in
 * `NavItems` are unchanged — that's the actual component being adopted
 * here, not the icon or navigation-primitive choices.
 *
 * `NavBody`'s original hardcoded `minWidth: 800px` was dropped — that
 * combined with an animated `width: 40%` risks the exact kind of
 * horizontal-overflow regression Phase 8's responsive audit specifically
 * checked for at moderate desktop widths, for a component only ever
 * rendered at `lg` and up here.
 */

interface NavbarProps {
  children: ReactNode;
  className?: string;
}

interface NavBodyProps {
  children: ReactNode;
  className?: string;
  visible?: boolean;
}

interface NavItem {
  name: string;
  link: string;
}

interface NavItemsProps {
  items: NavItem[];
  className?: string;
  onItemClick?: () => void;
  isActive?: (link: string) => boolean;
}

interface MobileNavProps {
  children: ReactNode;
  className?: string;
  visible?: boolean;
}

interface MobileNavHeaderProps {
  children: ReactNode;
  className?: string;
}

interface MobileNavMenuProps {
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  onClose: () => void;
}

const SHRINK_SCROLL_THRESHOLD = 100;

export function Navbar({ children, className }: NavbarProps) {
  // Plain page-scroll tracking (window `scrollY` in pixels), not the
  // `target`-based progress variant of `useScroll` — that measures a
  // target element's own scroll progress through the viewport, which is
  // self-referential and gives a 0-1 fraction rather than a pixel count
  // for a `position: sticky` element that never actually leaves the top
  // of the viewport. A plain pixel count is what the `> 100` threshold
  // below actually needs.
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(false);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setVisible(latest > SHRINK_SCROLL_THRESHOLD);
  });

  return (
    <div className={cn('sticky inset-x-0 top-0 z-40 w-full', className)}>
      {Children.map(children, (child) =>
        isValidElement(child)
          ? cloneElement(child as ReactElement<{ visible?: boolean }>, {
              visible,
            })
          : child,
      )}
    </div>
  );
}

const SHADOW_VISIBLE =
  '0 0 24px rgba(34, 42, 53, 0.06), 0 1px 1px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(34, 42, 53, 0.04), 0 0 4px rgba(34, 42, 53, 0.08), 0 16px 68px rgba(47, 48, 55, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1) inset';

export function NavBody({ children, className, visible }: NavBodyProps) {
  return (
    <motion.div
      animate={{
        backdropFilter: visible ? 'blur(10px)' : 'none',
        boxShadow: visible ? SHADOW_VISIBLE : 'none',
        width: visible ? '65%' : '100%',
        y: visible ? 12 : 0,
      }}
      transition={{ type: 'spring', stiffness: 200, damping: 50 }}
      className={cn(
        'relative z-[60] mx-auto hidden w-full max-w-6xl flex-row items-center justify-between self-start rounded-full bg-transparent px-4 py-2 lg:flex',
        // A soft box-shadow (animated above) is the whole "elevated pill"
        // effect once scrolled — no border on top of it. A hard 1px
        // border stacked on the shadow reads as a double outline rather
        // than a clean, soft-elevated surface.
        visible && 'bg-background/80',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function NavItems({
  items,
  className,
  onItemClick,
  isActive,
}: NavItemsProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    // `pointer-events-none` on this wrapper — it's sized to `inset-0`
    // (the full NavBody, logo through buttons) purely so its single
    // centered item can be positioned independently of the flex layout
    // around it, not because it should ever intercept a click or hover.
    // Left at the default `pointer-events: auto`, this transparent
    // overlay silently sat in front of the Sign in/Sign up buttons (a
    // positioned element paints above its non-positioned siblings
    // regardless of DOM order when neither sets `z-index`), swallowing
    // their clicks and hover — a real bug, caught live, not theoretical.
    // Each `<Link>` below opts back into `pointer-events-auto` itself.
    <div
      className={cn(
        'pointer-events-none absolute inset-0 hidden flex-1 flex-row items-center justify-center space-x-1 text-sm font-medium text-muted lg:flex',
        className,
      )}
    >
      {items.map((item, idx) => {
        const active = isActive?.(item.link) ?? false;
        const isHovered = hovered === idx;
        return (
          <Link
            onMouseEnter={() => setHovered(idx)}
            onMouseLeave={() =>
              setHovered((current) => (current === idx ? null : current))
            }
            onClick={onItemClick}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'pointer-events-auto relative rounded-full px-4 py-2 transition-colors',
              // The hover pill below is a fixed near-white surface (the
              // same `--secondary` token every secondary button uses) in
              // both themes — so hovered text must pair with its fixed
              // dark `--secondary-foreground`, not the theme-reactive
              // `--foreground`, which goes invisible-on-white in dark
              // mode.
              isHovered
                ? 'text-secondary-foreground'
                : active
                  ? 'text-foreground'
                  : 'text-muted hover:text-foreground',
            )}
            key={item.link}
            to={item.link}
          >
            {isHovered && (
              <motion.div
                layoutId="navbar-hovered-pill"
                className="bg-secondary pointer-events-none absolute inset-0 h-full w-full rounded-full"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            <span className="relative z-20">{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function MobileNav({ children, className, visible }: MobileNavProps) {
  return (
    <motion.div
      animate={{
        backdropFilter: visible ? 'blur(10px)' : 'none',
        boxShadow: visible ? SHADOW_VISIBLE : 'none',
        borderRadius: visible ? '1rem' : '2rem',
        y: visible ? 12 : 0,
      }}
      transition={{ type: 'spring', stiffness: 200, damping: 50 }}
      className={cn(
        'relative z-50 mx-auto flex w-full max-w-[calc(100vw-2rem)] flex-col items-center justify-between bg-transparent px-4 py-2 lg:hidden',
        visible && 'bg-background/95',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function MobileNavHeader({ children, className }: MobileNavHeaderProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-row items-center justify-between',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MobileNavMenu({
  children,
  className,
  isOpen,
  onClose,
}: MobileNavMenuProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Dismiss on outside click/tap — a plain button, not a div,
           * so it's a real, keyboard-operable control (skippable via
           * Escape, handled by the caller) rather than a click trap. */}
          <motion.button
            type="button"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 cursor-default bg-transparent lg:hidden"
          />
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={cn(
              'bg-background absolute inset-x-0 top-16 z-50 flex w-full flex-col items-start justify-start gap-4 rounded-lg border border-border px-4 py-6 shadow-lg',
              className,
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      className="size-6"
      aria-hidden="true"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      className="size-6"
      aria-hidden="true"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

interface MobileNavToggleProps {
  isOpen: boolean;
  onClick: () => void;
}

export function MobileNavToggle({ isOpen, onClick }: MobileNavToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
      className="cursor-pointer p-1 text-foreground"
    >
      {isOpen ? <CloseIcon /> : <MenuIcon />}
    </button>
  );
}

export function NavbarLogo() {
  return (
    <Link
      to="/"
      className="relative z-20 mr-4 flex items-center px-2 py-1 text-lg font-semibold text-foreground"
    >
      EventHub
    </Link>
  );
}

type NavbarButtonVariant = 'primary' | 'secondary';

interface NavbarButtonProps {
  to?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  children: ReactNode;
  className?: string;
  variant?: NavbarButtonVariant;
}

const NAVBAR_BUTTON_VARIANT_CLASSES: Record<NavbarButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary:
    'border border-secondary-border bg-secondary text-secondary-foreground hover:bg-secondary-hover',
};

/** The same two variants and design tokens `Button` uses (§ 17 of Phase
 * 1's design-token brief) — a link-or-button navbar action, not a second
 * competing button design system. */
export function NavbarButton({
  to,
  onClick,
  type = 'button',
  children,
  className,
  variant = 'primary',
}: NavbarButtonProps) {
  const classes = cn(
    'inline-flex cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors',
    NAVBAR_BUTTON_VARIANT_CLASSES[variant],
    className,
  );

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
