/**
 * Returns true only when the vacancy text clearly requires prior experience.
 * Explicit fresher allowances and ranges beginning at zero take precedence.
 */
function requiresPriorExperience(value) {
    const experience = String(value || '')
        .toLowerCase()
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    if (!experience) return false;

    if (/\bfreshers?\b|\bno experience\b|\bentry[ -]level\b/.test(experience)) {
        return false;
    }

    const range = experience.match(/\b(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*years?\b/);
    if (range) return Number(range[1]) > 0;

    const minimum = experience.match(/\b(?:minimum|min\.?|at least)\s*(\d+(?:\.\d+)?)\s*years?\b/);
    if (minimum) return Number(minimum[1]) > 0;

    const yearsWithExperience = experience.match(/\b(\d+(?:\.\d+)?)\s*(\+\s*)?years?\s*(?:of\s+)?experience\b/);
    if (yearsWithExperience) return Number(yearsWithExperience[1]) > 0;

    const yearsPlus = experience.match(/\b(\d+(?:\.\d+)?)\s*\+\s*years?\b/);
    if (yearsPlus) return Number(yearsPlus[1]) > 0;

    return /\bexperienced\b/.test(experience);
}

module.exports = { requiresPriorExperience };
