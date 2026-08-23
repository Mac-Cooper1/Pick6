import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { leagueApi } from '../services/api';
import { AppHeader } from '../components/AppHeader';
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
    return <div className="p-6 text-gray-600">Invalid league ID</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-gray-100">
      <AppHeader
        backTo="/dashboard"
        backLabel="Back to My Leagues"
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabRef={(id, el) => {
          tabRefs.current[id] = el;
        }}
      />

      {/* Tab Content */}
      <main className="max-w-6xl mx-auto">
        {activeTab === 'leaderboard' && <LeaderboardTab leagueId={leagueIdNum} />}
        {activeTab === 'weeks' && <WeekByWeekTab leagueId={leagueIdNum} />}
        {activeTab === 'league' && <LeagueTab leagueId={leagueIdNum} />}
        {activeTab === 'draft' && <DraftTab leagueId={leagueIdNum} />}
        {activeTab === 'recap' && <DraftRecapTab leagueId={leagueIdNum} />}
        {activeTab === 'settings' && <SettingsTab leagueId={leagueIdNum} />}
      </main>
    </div>
  );
}
