import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { draftEnhancedApi, leagueApi } from '../services/api';
import { DraftRoom } from './DraftRoom';

interface DraftTabProps {
  leagueId: number;
}

export function DraftTab({ leagueId }: DraftTabProps) {
  // Get draft state to determine which view to show
  const { data: draftState, isLoading } = useQuery({
    queryKey: ['draftState', leagueId],
    queryFn: () => draftEnhancedApi.getDraftState(leagueId),
    refetchInterval: 5000, // Poll every 5 seconds for status changes
  });

  // Get league info
  const { data: leagues } = useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });

  const currentLeague = leagues?.find(l => l.id === leagueId);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  // Use DraftRoom for LIVE, SCHEDULED (with timer about to start), and viewing results
  // The DraftRoom handles all draft states now
  if (draftState) {
    return <DraftRoom leagueId={leagueId} />;
  }

  // Fallback for when draft state is not available
  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Draft</h2>
        <p className="text-gray-600 mb-4">
          Unable to load draft state. Please try again later.
        </p>
        {currentLeague && (
          <div className="text-sm text-gray-500">
            <p>Draft Status: {currentLeague.draftStatus}</p>
            {currentLeague.draftScheduledAt && (
              <p>
                Scheduled: {new Date(currentLeague.draftScheduledAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
