describe('Free Bot Rise/Fall analysis', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="bots-grid"></div>';
    jest.resetModules();
    require('../static/js/bots-page.js');
  });

  const makeTicks = (direction) => Array.from({ length: 120 }, (_, index) => ({
    price: 100 + direction * index,
  }));

  it('qualifies a consistently rising market as Rise', () => {
    const result = window.AutonixFreeBotStrategy.analyzeRiseFall(makeTicks(1));

    expect(result).toEqual(expect.objectContaining({
      valid: true,
      selection: 'rise',
      tradeType: 'rise-fall',
      alignedWindows: 5,
    }));
  });

  it('qualifies a consistently falling market as Fall', () => {
    const result = window.AutonixFreeBotStrategy.analyzeRiseFall(makeTicks(-1));

    expect(result.valid).toBe(true);
    expect(result.selection).toBe('fall');
  });

  it('rejects noisy direction changes and insufficient tick history', () => {
    const noisy = Array.from({ length: 120 }, (_, index) => ({
      price: 100 + (index % 2 ? 1 : 0),
    }));

    expect(window.AutonixFreeBotStrategy.analyzeRiseFall(noisy).valid).toBe(false);
    expect(window.AutonixFreeBotStrategy.analyzeRiseFall(makeTicks(1).slice(0, 50)).valid).toBe(false);
  });
});