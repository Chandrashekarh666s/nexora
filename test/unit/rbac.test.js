const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, canViewStudent } = require('../../src/lib/rbac');

const student = { id: 'a1', role: ROLES.STUDENT };
const coord = { id: 'c1', role: ROLES.STUDENT_COORDINATOR };
const faculty = { id: 'f1', role: ROLES.FACULTY_COORDINATOR };

test('a user can view their own profile', () => assert.equal(canViewStudent(student, 'a1'), true));
test('a student cannot view another student', () => assert.equal(canViewStudent(student, 'b2'), false));
test('a coordinator cannot view an unassigned student', () => assert.equal(canViewStudent(coord, 'b2'), false));
test('a coordinator can view an assigned student', () => assert.equal(canViewStudent(coord, 'b2', { isAssigned: true }), true));
test('faculty can view any student', () => assert.equal(canViewStudent(faculty, 'b2'), true));
test('no actor means no access', () => assert.equal(canViewStudent(null, 'b2'), false));
test('assignment flag must be exactly true', () => assert.equal(canViewStudent(coord, 'b2', { isAssigned: 'yes' }), false));
