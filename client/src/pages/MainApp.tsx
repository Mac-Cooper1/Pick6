import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { leagueApi } from '../services/api';
import { AppHeader } from '../components/AppHeader';
import { LeagueTab } from '../components/LeagueTab';
import { DraftTab } from '../components/DraftTab';
import { MyTeamTab } from '../components/MyTeamTab';
import { LeaderboardTab } from '../components/LeaderboardTab';
import { WeekByWeekTab } from '../components/WeekByWeekTab';
import { SwapTab } from '../components/SwapTab';
import { SettingsTab } from '../components/SettingsTab';
import { LeagueVideoBanner } from '../components/VideoMessages';

type Tab = 'leaderboard' | 'myteam' | 'weeks' | 'league' | 'draft' | 'swap' | 'settings';

// Settings isn't in the strip: the header's Settings button opens it
const TABS: { id: Tab; label: string }[] = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'myteam', label: 'My Team' },
  { id: 'weeks', label: 'Week by Week' },
  { id: 'league', label: 'League' },
  { id: 'draft', label: 'Draft' },
  { id: 'swap', label: 'Week 6 Swap' },
];

export function MainApp() {
  const { leagueId } = useParams<{ leagueId: string }>();
  // Coming back from Stripe Checkout (paying for a video) lands on
  // Settings, where the video maker picks the payment up
  const [params] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() =>
    params.get('video_paid') || params.get('video_canceled') ? 'settings' : 'leaderboard'
  );
  // "Make your own" under a league video opens Settings at the video maker.
  // A count, not a flag, so every tap scrolls there (0 = plain Settings).
  const [videoMakerTaps, setVideoMakerTaps] = useState(0);
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
        onSettings={() => {
          setVideoMakerTaps(0);
          setActiveTab('settings');
        }}
        settingsActive={activeTab === 'settings'}
      />

      {/* Tab Content */}
      <main className="max-w-6xl mx-auto">
        {/* The league's latest video message, until watched */}
        <LeagueVideoBanner
          leagueId={leagueIdNum}
          onMakeOwn={() => {
            setVideoMakerTaps((n) => n + 1);
            setActiveTab('settings');
          }}
        />
        {activeTab === 'leaderboard' && <LeaderboardTab leagueId={leagueIdNum} />}
        {activeTab === 'myteam' && <MyTeamTab leagueId={leagueIdNum} />}
        {activeTab === 'weeks' && <WeekByWeekTab leagueId={leagueIdNum} />}
        {activeTab === 'league' && <LeagueTab leagueId={leagueIdNum} />}
        {activeTab === 'draft' && <DraftTab leagueId={leagueIdNum} />}
        {activeTab === 'swap' && <SwapTab leagueId={leagueIdNum} />}
        {activeTab === 'settings' && <SettingsTab leagueId={leagueIdNum} scrollToVideo={videoMakerTaps} />}
      </main>
    </div>
  );
}
