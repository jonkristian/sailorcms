<script lang="ts">
  let { password } = $props<{ password: string }>();

  // Simple password strength calculation without external library
  const strength = $derived.by(() => {
    if (!password) return 0;

    let score = 0;

    // Length requirements (more strict)
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Character type checks
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    // Bonus for very long passwords
    if (password.length >= 16) score++;

    // Map score to 0-4 scale for display
    if (score <= 2) return 1; // Weak
    if (score <= 4) return 2; // Fair
    if (score <= 5) return 3; // Strong
    return 4; // Very strong
  });

  const strengthLabels = ['', 'Weak', 'Fair', 'Strong', 'Very strong'];
</script>

<div class="flex items-center gap-2">
  <div class="flex h-1.5 min-w-24 flex-1 gap-1">
    {#each Array(4) as _, i (i)}
      <div
        class={`flex-1 rounded-sm transition-colors duration-200 ${
          i < strength && strength <= 2
            ? 'bg-red-500'
            : i < strength && strength === 3
              ? 'bg-yellow-500'
              : i < strength && strength >= 4
                ? 'bg-green-500'
                : 'bg-muted/20'
        }`}
      ></div>
    {/each}
  </div>
  <p class="text-muted-foreground text-xs whitespace-nowrap">
    {password ? strengthLabels[strength] : ''}
  </p>
</div>
