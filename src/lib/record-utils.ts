interface UpdatedRecord {
  id: string;
  updatedAt: string;
}

export function mergeRecordsByUpdatedAt<T extends UpdatedRecord>(
  current: readonly T[],
  incoming: readonly T[],
  preferIncomingOnEqual = false,
): T[] {
  const records = new Map(current.map((record) => [record.id, record]));

  incoming.forEach((record) => {
    const existing = records.get(record.id);
    const comparison = existing ? record.updatedAt.localeCompare(existing.updatedAt) : 1;
    if (!existing || comparison > 0 || (preferIncomingOnEqual && comparison === 0)) {
      records.set(record.id, record);
    }
  });

  return [...records.values()].sort((left, right) => {
    const comparison = right.updatedAt.localeCompare(left.updatedAt);
    return comparison || left.id.localeCompare(right.id);
  });
}
