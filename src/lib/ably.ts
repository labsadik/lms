import Ably from 'ably';

const ABLY_API_KEY = import.meta.env.VITE_ABLY_API_KEY;

export const ably = ABLY_API_KEY
  ? new Ably.Realtime({ key: ABLY_API_KEY })
  : null;