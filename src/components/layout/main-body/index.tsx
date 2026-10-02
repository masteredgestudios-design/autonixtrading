import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import './main-body.scss';

type TMainBodyProps = {
    children: React.ReactNode;
};

const MainBody: React.FC<TMainBodyProps> = observer(({ children }) => {
    const { ui } = useStore() ?? {
        ui: {
            setDevice: () => {},
            is_dark_mode_on: false,
        },
    };
    const { setDevice, is_dark_mode_on } = ui;
    const { isDesktop, isMobile, isTablet } = useDevice();

    // Keep the document theme attributes aligned with the saved shared preference.
    useEffect(() => {
        const body = document.querySelector('body');
        if (!body) return;
        const theme = is_dark_mode_on ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        if (is_dark_mode_on) {
            body.classList.remove('theme--light');
            body.classList.add('theme--dark');
        } else {
            body.classList.remove('theme--dark');
            body.classList.add('theme--light');
        }

        const syncThemeFromStorage = (event: StorageEvent) => {
            if (event.key !== 'at_theme' && event.key !== 'theme') return;
            const storedTheme = event.newValue;
            if (storedTheme === 'dark' || storedTheme === 'light') {
                body.classList.add('theme-transition');
                window.setTimeout(() => body.classList.remove('theme-transition'), 240);
                setDarkMode(storedTheme === 'dark');
            }
        };

        window.addEventListener('storage', syncThemeFromStorage);
        return () => window.removeEventListener('storage', syncThemeFromStorage);
    }, [is_dark_mode_on, setDarkMode]);

    useEffect(() => {
        if (isMobile) {
            setDevice('mobile');
        } else if (isTablet) {
            setDevice('tablet');
        } else {
            setDevice('desktop');
        }
    }, [isDesktop, isMobile, isTablet, setDevice]);

    return <div className='main-body'>{children}</div>;
});

export default MainBody;
