'use client';

import { Button } from '@/components/ui/button';
import { Trash2, X } from 'lucide-react';
import { useState } from 'react';

interface BulkActionsProps {
  count: number;
  onDelete: () => Promise<void>;
  onClear: () => void;
}

export function BulkActions({ count, onDelete, onClear }: BulkActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    await onDelete();
    setBusy(false);
    setConfirming(false);
  }

  return (
    <div className="flex items-center gap-3 mb-4 p-3 bg-surface2 border border-border rounded-lg">
      <span className="text-sm text-text font-medium">{count} selected</span>
      <div className="flex gap-2 ml-auto">
        <Button
          variant={confirming ? 'danger' : 'ghost'}
          size="sm"
          onClick={handleDelete}
          disabled={busy}
          className={!confirming ? 'text-red-400' : ''}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {confirming ? 'Confirm Delete' : 'Delete'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { onClear(); setConfirming(false); }}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
