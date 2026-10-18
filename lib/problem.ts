// The one problem this demo tutors. Shared by the page (to show it) and the
// API route (to put it in the system prompt).

export const PROBLEM = `longest_streak(nums)

Return the length of the longest run of consecutive equal numbers in a list.

  longest_streak([1, 1, 2, 2, 2, 3])  ->  3
  longest_streak([])                  ->  0`;

// Starter code with a classic bug: the last run is never compared to `best`,
// so longest_streak([1, 2, 2, 2]) returns 1 instead of 3.
export const STARTER_CODE = `def longest_streak(nums):
    best = 0
    current = 1
    for i in range(1, len(nums)):
        if nums[i] == nums[i - 1]:
            current += 1
        else:
            best = max(best, current)
            current = 1
    return best
`;
