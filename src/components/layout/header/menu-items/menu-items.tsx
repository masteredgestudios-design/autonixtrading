// ========================================
// MENU ITEMS PLACEHOLDER FOR WHITE-LABELING
// ========================================
//
// This component has been simplified for white-labeling.
// Third-party developers can add custom menu items here.
//
// EXAMPLE USAGE:
// --------------
// import { observer } from 'mobx-react-lite';
// import { useStore } from '@/hooks/useStore';
// import { useTranslations } from '@deriv-com/translations';
// import { MenuItem, Text } from '@deriv-com/ui';
//
// export const MenuItems = observer(() => {
//     const { localize } = useTranslations();
//     const store = useStore();
//     const is_logged_in = store?.client?.is_logged_in ?? false;
//
//     if (!is_logged_in) return null;
//
//     return (
//         <>
//             <MenuItem
//                 as='a'
//                 className='app-header__menu'
//                 href='/your-page'
//                 leftComponent={YourIcon}
//             >
//                 <Text>{localize('Your Menu Item')}</Text>
//             </MenuItem>
//         </>
//     );
// });
//
// For mobile menu items, see:
// src/components/layout/header/mobile-menu/use-mobile-menu-config.tsx

import { observer } from 'mobx-react-lite';
import { useLocation } from 'react-router';
import { useStore } from '@/hooks/useStore';
import './menu-items.scss';

type NavigationItem = {
    label: string;
    href: string;
};

const navigationItems: NavigationItem[] = [
    { label: 'Trader', href: '/trader' },
    { label: 'ATD Bot', href: '/ATDbot' },
    { label: 'Bots', href: '/bots' },
    { label: 'Journal', href: '/journal' },
    { label: 'FAQ', href: '/#faq' },
    { label: 'Strategy Guide', href: '/journal' },
    { label: 'Invest', href: '/invest' },
];

export const MenuItems = observer(() => {
    const store = useStore();
    const client = store?.client;
    const location = useLocation();

    const isCurrentPage = (href: string) => {
        const currentPath = location.pathname.toLowerCase();
        const currentHash = location.hash.toLowerCase();
        const target = href.toLowerCase();

        if (target === '/#faq') {
            return currentHash === '#faq' || (currentPath === '/' && currentHash === '#faq');
        }

        return currentPath === target || currentPath.startsWith(`${target}/`);
    };

    const menuItems = [...navigationItems];
    if (client?.is_logged_in) {
        menuItems.splice(6, 0, { label: 'Dashboard', href: '/dashboard' });
    }

    return (
        <nav className='app-header__menu' aria-label='Autonix pages'>
            {menuItems.map(({ label, href }) => {
                const isActive = isCurrentPage(href);

                return (
                    <a
                        key={href}
                        href={href}
                        className={isActive ? 'app-header__menu-item app-header__menu-item--active' : 'app-header__menu-item'}
                        aria-current={isActive ? 'page' : undefined}
                    >
                        {label}
                    </a>
                );
            })}
        </nav>
    );
});

export const TradershubLink = observer(() => {
    // No default Traders Hub link - add your custom navigation here if needed
    return null;
});

// Create a namespace for MenuItems to include TradershubLink
type MenuItemsType = typeof MenuItems & {
    TradershubLink: typeof TradershubLink;
};

// Assign TradershubLink to MenuItems
(MenuItems as MenuItemsType).TradershubLink = TradershubLink;

export default MenuItems as MenuItemsType;
// [/AI]
