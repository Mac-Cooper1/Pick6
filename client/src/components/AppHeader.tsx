import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './Button';
import { Logo } from './Logo';

/**
 * The signed-in header: deep-green band with the logo, the user's name and
 * Logout. Pages can add a back arrow and a tab strip that lives *inside* the
 * band (broadcast-scoreboard style: condensed uppercase labels, gold underline
 * on the active one). The strip scrolls sideways on phones.
 */

export interface HeaderTab<T extends string> {
  id: T;
  label: string;
}

interface AppHeaderProps<T extends string> {
  backTo?: string;
  backLabel?: string;
  tabs?: HeaderTab<T>[];
  activeTab?: T;
  onTabChange?: (id: T) => void;
  tabRef?: (id: T, el: HTMLButtonElement | null) => void;
}

export function AppHeader<T extends string>({
  backTo,
  backLabel = 'Back',
  tabs,
  activeTab,
  onTabChange,
  tabRef,
}: AppHeaderProps<T>) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <header className="bg-green-900 text-white shadow-card-lg relative z-20">
      <div className="max-w-6xl mx-auto px-3 sm:px-4">
        <div className="h-14 sm:h-16 flex justify-between items-center gap-3">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            {backTo && (
              <button
                onClick={() => navigate(backTo)}
                className="w-10 h-10 -ml-2 flex items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white active:bg-white/5 transition-colors"
                title={backLabel}
                aria-label={backLabel}
              >
                <ArrowLeft size={22} weight="bold" />
              </button>
            )}
            <Logo tone="dark" />
          </div>
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <span className="text-sm text-white/80 truncate min-w-0">{user?.name}</span>
            <Button variant="nav" size="sm" onClick={logout} className="shrink-0">
              Log out
            </Button>
          </div>
        </div>

        {tabs && (
          <nav
            className="-mx-3 sm:mx-0 px-3 sm:px-0 flex overflow-x-auto no-scrollbar md:overflow-visible border-t border-white/10"
            aria-label="League sections"
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => tabRef?.(tab.id, el)}
                  onClick={() => onTabChange?.(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative shrink-0 md:flex-1 h-12 px-4 md:px-2 font-display font-semibold uppercase tracking-wider text-[15px] md:text-base whitespace-nowrap transition-colors touch-manipulation ${
                    active
                      ? 'text-white'
                      : 'text-white/55 hover:text-white active:text-white'
                  }`}
                >
                  {tab.label}
                  <span
                    aria-hidden="true"
                    className={`absolute left-3 right-3 md:left-2 md:right-2 bottom-0 h-[3px] rounded-t-full transition-colors ${
                      active ? 'bg-amber-400' : 'bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
