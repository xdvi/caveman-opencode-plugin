# source from config.fish, then use (caveman_prompt_segment) in fish_prompt.
function caveman_prompt_segment
  set -l dir "$HOME/.config/opencode"
  if set -q XDG_CONFIG_HOME
    set dir "$XDG_CONFIG_HOME/opencode"
  end
  set -l flag "$dir/.caveman-active"
  if test -f "$flag"
    set -l mode (cat "$flag" 2>/dev/null)
    if test -n "$mode"
      printf 'caveman:%s' "$mode"
    end
  end
end
