import { lisbonDay } from './routine-model.mjs?v=health-night-1';
import { validDay } from './habits-model.mjs?v=health-night-1';
export { lisbonDay };
export const exercises = [
  { id: 'pushups', name: 'Push-ups', goal: 50 },
  { id: 'abs', name: 'Abs', goal: 50 }
];
export function readFitnessDay(day, data) {
  if (!validDay(day) || !data || Object.keys(data).sort().join(',') !== 'abs,pushups,revision,version'
    || data.version !== 1 || !Number.isInteger(data.revision) || data.revision < 1 || data.revision > 1000000000
    || exercises.some(({ id }) => !Number.isInteger(data[id]) || data[id] < 0 || data[id] > 5000)) throw new Error('Invalid Fitness record.');
  return { version: 1, revision: data.revision, pushups: data.pushups, abs: data.abs };
}
export function adjustFitnessDay(day, saved, exercise, delta) {
  if (!exercises.some(({ id }) => id === exercise) || ![-1, 1, 5, 10].includes(delta)) throw new Error('Invalid exercise change.');
  const before = saved ? readFitnessDay(day, saved) : { version: 1, revision: 0, pushups: 0, abs: 0 };
  return readFitnessDay(day, { ...before, revision: before.revision + 1, [exercise]: Math.max(0, Math.min(5000, before[exercise] + delta)) });
}
