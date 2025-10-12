import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LeagueTab } from '../components/LeagueTab';
import { DraftTab } from '../components/DraftTab';
import { StandingsTab } from '../components/StandingsTab';

type Tab = 'league' | 'draft' | 'standings';

export function MainApp() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('league');

  if (!leagueId) {
    return <div>Invalid league ID</div>;
  }

  const leagueIdNum = parseInt(leagueId);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav className="bg-green-800 text-white p-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Pick 6</h1>
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
          <button
            onClick={() => setActiveTab('league')}
            className={`flex-1 py-4 font-semibold transition-colors ${
              activeTab === 'league'
                ? 'bg-green-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            League
          </button>
          <button
            onClick={() => setActiveTab('draft')}
            className={`flex-1 py-4 font-semibold transition-colors ${
              activeTab === 'draft'
                ? 'bg-green-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Draft
          </button>
          <button
            onClick={() => setActiveTab('standings')}
            className={`flex-1 py-4 font-semibold transition-colors ${
              activeTab === 'standings'
                ? 'bg-green-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Standings
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-6xl mx-auto">
        {activeTab === 'league' && <LeagueTab leagueId={leagueIdNum} />}
        {activeTab === 'draft' && <DraftTab leagueId={leagueIdNum} />}
        {activeTab === 'standings' && <StandingsTab leagueId={leagueIdNum} />}
      </div>
    </div>
  );
}
