import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { leagueApi } from '../services/api';
import { LeagueTab } from '../components/LeagueTab';
import { DraftTab } from '../components/DraftTab';
import { StandingsTab } from '../components/StandingsTab';
import { AuctionTab } from '../components/AuctionTab';
import { SettingsTab } from '../components/SettingsTab';

type Tab = 'league' | 'standings' | 'auction' | 'draft' | 'settings';

export function MainApp() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('league');

  if (!leagueId) {
    return <div>Invalid league ID</div>;
  }

  const leagueIdNum = parseInt(leagueId);

  // Fetch my leagues to check commissioner status
  const { data: myLeagues } = useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });

  const currentLeague = myLeagues?.find((l) => l.id === leagueIdNum);
  const isCommissioner = currentLeague?.isCommissioner ?? false;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'league', label: 'League' },
    { id: 'standings', label: 'Standings' },
    { id: 'auction', label: 'Auction' },
    { id: 'draft', label: 'Draft' },
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
        {activeTab === 'league' && <LeagueTab leagueId={leagueIdNum} />}
        {activeTab === 'standings' && <StandingsTab leagueId={leagueIdNum} />}
        {activeTab === 'auction' && <AuctionTab leagueId={leagueIdNum} isCommissioner={isCommissioner} />}
        {activeTab === 'draft' && <DraftTab leagueId={leagueIdNum} />}
        {activeTab === 'settings' && <SettingsTab leagueId={leagueIdNum} />}
      </div>
    </div>
  );
}
