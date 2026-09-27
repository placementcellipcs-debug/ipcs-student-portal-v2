const normalizeCourse = (value) => String(value || '')
    .trim()
    .replace(/^\d+\.\s*/, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();

const buildCourseGroups = (rows = []) => {
    const groups = new Map();
    const parentByCourse = new Map();
    let parent = '';
    rows.forEach((row) => {
        const candidateParent = normalizeCourse(row?.[0]);
        if (candidateParent) {
            parent = candidateParent;
            if (!groups.has(parent)) groups.set(parent, new Set());
        }
        const child = normalizeCourse(row?.[1]);
        if (parent && child) {
            groups.get(parent).add(child);
            parentByCourse.set(child, parent);
        }
    });
    return { groups, parentByCourse };
};

const getCourseAccess = (studentCourse, rows = []) => {
    const course = normalizeCourse(studentCourse);
    if (!course) return new Set();
    const { groups, parentByCourse } = buildCourseGroups(rows);
    const parent = parentByCourse.get(course);
    if (parent) return new Set([parent, course]);
    const children = groups.get(course);
    if (children) return new Set([course, ...children]);
    return new Set([course]);
};

const courseTokens = (value) => String(value || '')
    .split(/[,;|\n]+/)
    .map(normalizeCourse)
    .filter(Boolean);

const courseMatchesAccess = (targetCourse, accessSet, { allowAll = true } = {}) => {
    const tokens = courseTokens(targetCourse);
    if (!tokens.length) return allowAll;
    return tokens.some((token) => (allowAll && ['all', 'all courses', 'all students'].includes(token)) || accessSet.has(token));
};

module.exports = { normalizeCourse, buildCourseGroups, getCourseAccess, courseMatchesAccess };
