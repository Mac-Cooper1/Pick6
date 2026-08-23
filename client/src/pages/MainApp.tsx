import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { leagueApi } from '../services/api';
import { Button } from '../components/Button';
import { LeagueTab } from '../components/LeagueTab';
import { DraftTab } from '../components/DraftTab';
import { DraftRecapTab } from '../components/DraftRecapTab';
import { LeaderboardTab } from '../components/LeaderboardTab';
import { WeekByWeekTab } from '../components/WeekByWeekTab';
import { SettingsTab } from '../components/SettingsTab';

type Tab = 'leaderboard' | 'weeks' | 'league' | 'draft' | 'recap' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'weeks', label: 'Week by Week' },
  { id: 'league', label: 'League' },
  { id: 'draft', label: 'Draft' },
  { id: 'recap', label: 'Draft Recap' },
  { id: 'settings', label: 'Settings' },
];

export function MainApp() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard');
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const leagueIdNum = leagueId ? parseInt(leagueId) : NaN;

  // Hooks must run unconditionally (no early return above this line)
  useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });

  // On phones the tab strip scrolls sideways — keep the active tab in view.
  useEffect(() => {
    tabRefs.current[activeTab]?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
  }, [activeTab]);

  if (!leagueId || isNaN(leagueIdNum)) {
    return <div>Invalid league ID</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav className="bg-green-800 text-white px-3 py-2 sm:px-4 sm:py-3 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center gap-3">
          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-10 h-10 -ml-2 flex items-center justify-center rounded-lg text-xl hover:bg-green-700 active:bg-green-900 transition-colors"
              title="Back to My Leagues"
              aria-label="Back to My Leagues"
            >
              &larr;
            </button>
            <h1 className="text-xl sm:text-2xl font-bold">Pick 6</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <span className="text-sm truncate min-w-0">{user?.name}</span>
            <Button variant="nav" size="sm" onClick={logout} className="shrink-0">
              Logout
            </Button>
          </div>
        </div>
      </nav>

      {/* Tab strip — scrolls sideways on phones (the 4th tab peeks at the
          edge; the active one auto-scrolls into view), equal-width on desktop */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto flex overflow-x-auto no-scrollbar md:overflow-visible">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                onClick={() => setActiveTab(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 md:flex-1 min-h-[3rem] px-4 md:px-2 text-sm md:text-base font-semibold whitespace-nowrap border-b-[3px] transition-colors touch-manipulation ${
                  active
                    ? 'border-green-600 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50 active:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-6xl mx-auto">
        {activeTab === 'leaderboard' && <LeaderboardTab leagueId={leagueIdNum} />}
        {activeTab === 'weeks' && <WeekByWeekTab leagueId={leagueIdNum} />}
        {activeTab === 'league' && <LeagueTab leagueId={leagueIdNum} />}
        {activeTab === 'draft' && <DraftTab leagueId={leagueIdNum} />}
        {activeTab === 'recap' && <DraftRecapTab leagueId={leagueIdNum} />}
        {activeTab === 'settings' && <SettingsTab leagueId={leagueIdNum} />}
      </div>
    </div>
  );
}
