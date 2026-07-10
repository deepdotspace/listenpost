import { test, expect } from 'deepspace/testing'
import { ensureWorkspace } from './helpers/workspace'

/**
 * Keywords CRUD — signed-in happy path (Phase 1 verification).
 * Creates a keyword, confirms it round-trips, edits it, deletes it.
 */

test.describe('Landing redirect', () => {
  test('signed-in users land on the live feed, not the marketing page', async ({ users }) => {
    const [user] = await users(1)
    await ensureWorkspace(user.page)
    await user.page.goto('/')
    await expect(user.page).toHaveURL(/\/mentions/, { timeout: 15000 })
    await expect(user.page.getByTestId('landing-page')).toHaveCount(0)
  })
})

test.describe('Keywords CRUD', () => {
  test('create → read → edit → delete', async ({ users }) => {
    const [user] = await users(1)
    await ensureWorkspace(user.page)
    const { page } = user
    const term = `__test-${Date.now()}__ durable objects`
    const editedTerm = `${term} (edited)`

    await page.goto('/keywords')
    await expect(page.getByTestId('add-keyword')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('auth-overlay')).toHaveCount(0)

    // Create
    await page.getByTestId('add-keyword').click()
    await page.getByTestId('keyword-term').fill(term)
    await page.getByTestId('keyword-context').fill('We build a serverless platform; DO mentions matter.')
    await page.getByTestId('save-keyword').click()

    const row = page.locator('[data-testid="keyword-row"]', { hasText: term })
    await expect(row).toBeVisible()
    await expect(row.getByText('Hacker News')).toBeVisible()

    // Edit — via the row's overflow menu.
    await row.getByRole('button', { name: 'Keyword actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    await page.getByTestId('keyword-term').fill(editedTerm)
    await page.getByTestId('save-keyword').click()
    const editedRow = page.locator('[data-testid="keyword-row"]', { hasText: editedTerm })
    await expect(editedRow).toBeVisible()

    // Pause — the active toggle is a role=switch; flipping it clears the checked state.
    const toggle = editedRow.getByRole('switch')
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    // Delete (cleanup) — via the overflow menu → Confirm.
    await editedRow.getByRole('button', { name: 'Keyword actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click()
    await expect(page.locator('[data-testid="keyword-row"]', { hasText: editedTerm })).toHaveCount(0)
  })
})
