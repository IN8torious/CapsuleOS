export const LESSON_CATEGORIES = ['structure', 'style', 'interaction', 'accessibility', 'performance', 'evidence'];
const COLORS = ['#7cbbe5', '#c19ce8', '#e7ac74', '#85d6b2', '#e6ce78', '#d38ba6'];

export function learningProfile(lessons) {
  const counts = Object.fromEntries(LESSON_CATEGORIES.map(category => [category, 0]));
  const stars = lessons.map(lesson => {
    if (!LESSON_CATEGORIES.includes(lesson.category) || typeof lesson.id !== 'string') {
      throw new Error('Unsupported approved learning profile.');
    }
    counts[lesson.category] += 1;
    let hash = 2166136261;
    for (const char of lesson.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    const angle = (hash / 0x100000000) * Math.PI * 2;
    const radius = 2.4 + (hash % 500) / 1000;
    return {
      position: [Math.cos(angle) * radius, ((hash >>> 10) % 500) / 1000 - .25, Math.sin(angle) * radius],
      color: COLORS[LESSON_CATEGORIES.indexOf(lesson.category)]
    };
  });
  const dominant = LESSON_CATEGORIES.reduce((best, category) => counts[category] > counts[best] ? category : best, LESSON_CATEGORIES[0]);
  return {
    stars, counts, count: lessons.length,
    accent: lessons.length ? COLORS[LESSON_CATEGORIES.indexOf(dominant)] : null,
    label: lessons.length ? `${lessons.length} approved lesson${lessons.length === 1 ? '' : 's'} · ${dominant}` : 'No approved lessons'
  };
}
