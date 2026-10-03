import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { localDay } from '../core/calendar';
export function useCurrentDay() {
    const [day, setDay] = useState(() => localDay(new Date()));
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const refresh = () => { clearTimeout(timer); const now = new Date(); setDay(localDay(now)); const midnight = new Date(now); midnight.setHours(24, 0, 0, 0); timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 10); };
        refresh();
        const sub = AppState.addEventListener('change', state => { if (state === 'active')
            refresh(); });
        return () => { clearTimeout(timer); sub.remove(); };
    }, []);
    return day;
}
