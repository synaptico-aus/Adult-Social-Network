import assert from 'node:assert/strict';
import test from 'node:test';
import type { MediaAttachment } from '@workspace/api-client-react';
import { selectReadyReel } from './reel-media';

const fixture = (id: string, fields: Partial<MediaAttachment>) => ({ id, ...fields }) as MediaAttachment;

test('a mixed video post selects the ready reel, not the regular video', () => {
  const regular = fixture('regular', { kind: 'video', videoFormat: 'post', status: 'ready' });
  const reel = fixture('reel', { kind: 'video', videoFormat: 'reel', status: 'ready' });
  assert.equal(selectReadyReel([regular, reel]), reel);
});

test('held, quarantined, rejected and non-video attachments cannot be selected', () => {
  const assets = [
    fixture('held', { kind: 'video', videoFormat: 'reel', status: 'held' }),
    fixture('quarantined', { kind: 'video', videoFormat: 'reel', status: 'quarantined' }),
    fixture('rejected', { kind: 'video', videoFormat: 'reel', status: 'rejected' }),
    fixture('photo', { kind: 'photo', status: 'ready' }),
  ];
  assert.equal(selectReadyReel(assets), undefined);
});

test('empty or unavailable media is handled safely', () => {
  assert.equal(selectReadyReel([]), undefined);
  assert.equal(selectReadyReel(), undefined);
});
