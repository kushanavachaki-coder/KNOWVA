export function calculateStudyStreak(
  messages: any[] = [],
  savedStudyNotes: any[] = [],
  uploadedMaterials: any[] = []
): number {
  const toLocalDateStr = (d: Date | string | number) => {
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const activeDatesSet = new Set<string>();

  messages.forEach(m => {
    const dStr = toLocalDateStr(m.timestamp);
    if (dStr) activeDatesSet.add(dStr);
  });

  savedStudyNotes.forEach(n => {
    const dStr = toLocalDateStr(n.createdAt);
    if (dStr) activeDatesSet.add(dStr);
  });

  uploadedMaterials.forEach(mat => {
    const dStr = toLocalDateStr(mat.uploadedAt);
    if (dStr) activeDatesSet.add(dStr);
  });

  let studyStreak = 0;
  if (activeDatesSet.size > 0) {
    const now = new Date();
    const todayStr = toLocalDateStr(now);

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = toLocalDateStr(yesterday);

    let startCursor: Date | null = null;
    if (activeDatesSet.has(todayStr)) {
      startCursor = now;
    } else if (activeDatesSet.has(yesterdayStr)) {
      startCursor = yesterday;
    }

    if (startCursor) {
      const cursor = new Date(startCursor);
      while (activeDatesSet.has(toLocalDateStr(cursor))) {
        studyStreak++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }
  }

  return studyStreak;
}
