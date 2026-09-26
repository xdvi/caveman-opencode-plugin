# source from .bashrc/.zshrc, then use $(caveman_prompt_segment) in PS1.
caveman_prompt_segment() {
  flag="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/.caveman-active"
  [ -f "$flag" ] || return 0
  mode=$(cat "$flag" 2>/dev/null) || return 0
  [ -n "$mode" ] && printf 'caveman:%s' "$mode"
  return 0
}
