import { observer } from 'mobx-react-lite';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { useTranslations } from '@deriv-com/translations';
import { Tooltip } from '@deriv-com/ui';

const ChangeTheme = observer(() => {
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();
    const { localize } = useTranslations();

    return (
        <Tooltip
            as='button'
            className='theme-toggle-button react-flask-header__theme-toggle'
            tooltipContent={localize('Change theme')}
            aria-label={localize(is_dark_mode_on ? 'Switch to light mode' : 'Switch to dark mode')}
            aria-pressed={is_dark_mode_on}
            title={localize(is_dark_mode_on ? 'Light mode' : 'Dark mode')}
            onClick={toggleTheme}
        >
            {is_dark_mode_on ? (
                <svg
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    aria-hidden='true'
                >
                    <circle cx='12' cy='12' r='5' />
                    <line x1='12' y1='1' x2='12' y2='3' />
                    <line x1='12' y1='21' x2='12' y2='23' />
                    <line x1='4.22' y1='4.22' x2='5.64' y2='5.64' />
                    <line x1='18.36' y1='18.36' x2='19.78' y2='19.78' />
                    <line x1='1' y1='12' x2='3' y2='12' />
                    <line x1='21' y1='12' x2='23' y2='12' />
                    <line x1='4.22' y1='19.78' x2='5.64' y2='18.36' />
                    <line x1='18.36' y1='5.64' x2='19.78' y2='4.22' />
                </svg>
            ) : (
                <svg
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    aria-hidden='true'
                >
                    <path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' />
                </svg>
            )}
        </Tooltip>
    );
});

export default ChangeTheme;
