import UiStore from '../ui-store';

describe('UiStore theme preference', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('defaults to light mode when no preference has been saved', () => {
        expect(new UiStore().is_dark_mode_on).toBe(false);
    });

    it('prefers the shared theme key over the legacy React key', () => {
        localStorage.setItem('at_theme', 'light');
        localStorage.setItem('theme', 'dark');

        expect(new UiStore().is_dark_mode_on).toBe(false);
    });

    it('honors the legacy React preference when no shared preference exists', () => {
        localStorage.setItem('theme', 'dark');

        expect(new UiStore().is_dark_mode_on).toBe(true);
    });
});
