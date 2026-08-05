import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { leagueApi } from '../services/api';
import { LeagueTab } from '../components/LeagueTab';
import { DraftTab } from '../components/DraftTab';
import { DraftRecapTab } from '../components/DraftRecapTab';
import { LeaderboardTab } from '../components/LeaderboardTab';
import { WeekByWeekTab } from '../components/WeekByWeekTab';
import { SettingsTab } from '../components/SettingsTab';

type Tab = 'leaderboard' | 'weeks' | 'league' | 'draft' | 'recap' | 'settings';

export function MainApp() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard');

  const leagueIdNum = leagueId ? parseInt(leagueId) : NaN;

  // Hooks must run unconditionally (no early return above this line)
  useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });

  if (!leagueId || isNaN(leagueIdNum)) {
    return <div>Invalid league ID</div>;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'weeks', label: 'Week by Week' },
    { id: 'league', label: 'League' },
    { id: 'draft', label: 'Draft' },
    { id: 'recap', label: 'Draft Recap' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav className="bg-green-800 text-white p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm hover:bg-green-700 px-2 py-1 rounded transition-colors"
              title="Back to My Leagues"
            >
              &larr;
            </button>
            <h1 className="text-2xl font-bold">Pick 6</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm">{user?.name}</span>
            <button
              onClick={logout}
              className="text-sm bg-green-700 hover:bg-green-600 px-3 py-1 rounded transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-4 font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
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
