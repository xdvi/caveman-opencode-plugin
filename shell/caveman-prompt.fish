# source from config.fish, then use (caveman_prompt_segment) in fish_prompt.
function caveman_prompt_segment
  set -l dir "$HOME/.config/opencode"
  if set -q XDG_CONFIG_HOME
    set dir "$XDG_CONFIG_HOME/opencode"
  end
  set -l flag "$dir/.caveman-active"
  # Symmetric with caveman-config.js readFlag: never follow symlinks.
  if test -f "$flag"; and not test -L "$flag"
    set -l mode (head -n 1 "$flag" 2>/dev/null | string trim)
    if test -n "$mode"; and string match -qr '^[a-z-]+$' -- "$mode"
      printf 'caveman:%s' "$mode"
    end
  end
end
