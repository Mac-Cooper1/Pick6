import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { draftApi, leagueApi } from '../services/api';
import { DraftRoom } from './DraftRoom';
import { Loading } from './Loading';

interface DraftTabProps {
  leagueId: number;
}

export function DraftTab({ leagueId }: DraftTabProps) {
  // Get draft state to determine which view to show
  const { data: draftState, isLoading } = useQuery({
    queryKey: ['draftState', leagueId],
    queryFn: () => draftApi.getDraftState(leagueId),
    refetchInterval: 5000, // Poll every 5 seconds for status changes
  });

  // Get league info
  const { data: leagues } = useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });

  const currentLeague = leagues?.find(l => l.id === leagueId);

  if (isLoading) return <Loading inline />;

  // Use DraftRoom for LIVE, SCHEDULED (with timer about to start), and viewing results
  // The DraftRoom handles all draft states now
  if (draftState) {
    return <DraftRoom leagueId={leagueId} />;
  }

  // Fallback for when draft state is not available
  return (
    <div className="p-4 sm:p-6">
      <div className="card p-6 sm:p-8 text-center">
        <h2 className="section-title mb-4">Draft</h2>
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
