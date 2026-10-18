# source from .bashrc/.zshrc, then use $(caveman_prompt_segment) in PS1.
caveman_prompt_segment() {
  flag="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/.caveman-active"
  # Symmetric with caveman-config.js readFlag: never follow symlinks.
  [ -f "$flag" ] || return 0
  [ -L "$flag" ] && return 0
  # First line only, whitespace stripped; reject anything that is not a mode id.
  mode=$(head -n 1 "$flag" 2>/dev/null | tr -d '\r\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//') || return 0
  case "$mode" in
    '' | *[!a-z-]*) return 0 ;;
  esac
  printf 'caveman:%s' "$mode"
  return 0
}
