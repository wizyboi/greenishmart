#!/bin/sh
# Copyright 2000-2021 JetBrains s.r.o. Use of this source code is governed by the Apache 2.0 license that can be found in the LICENSE file.

### This script is an internal implementation.
### The entry point is a shell script at './bin/remote-dev-server.sh'.

# https://sipb.mit.edu/doc/safe-shell
# https://belief-driven-design.com/9-tips-safer-shell-scripts-5b8d6afd618
set -e -u -f

usage()
{
  script_name="${REMOTE_DEV_LAUNCHER_NAME_FOR_USAGE:-$(basename "$0")}"
  echo "Usage: ./$script_name [starter command] [path to project]"
  echo "Examples:"
  echo "  ./$script_name run /path/to/project [arguments...]"
  echo "  ./$script_name status /path/to/project"
  echo "  ./$script_name warm-up /path/to/project [arguments...]"
  echo "  ./$script_name installPlugins /path/to/project PLUGIN_ID [PLUGIN_ID] ..."
  echo "  ./$script_name registerBackendLocationForGateway"

  echo "Environment variables:"
  echo "  REMOTE_DEV_SERVER_TRACE                    set to any value to get more debug output from the startup script"
  echo "  REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS  set to '0' to skip using bundled X11 and other linux libraries from plugins/remote-dev-server/selfcontained. Use everything from the system."
  echo "                                             by default bundled libraries are used"
  echo "  REMOTE_DEV_LAUNCHER_NAME_FOR_USAGE         set to any value to use as the script name in this output"
  echo "  REMOTE_DEV_TRUST_PROJECTS                  set to any value to skip project trust warning (will execute build scripts automatically)"
  echo "  REMOTE_DEV_NEW_UI_ENABLED                  set to '1' to start with forced enabled new UI"
  echo "  REMOTE_DEV_NON_INTERACTIVE                 set to any value to skip all interactive shell prompts (set automatically if running without TTY)"
  echo "  REMOTE_DEV_JDK_DETECTION                   set to '0' to disable JDK auto-detection and use it as project SDK if it is not pre-configured"
  echo "  REMOTE_DEV_LEGACY_PER_PROJECT_CONFIGS      set to '1' to keep the per-project config/system directories as in 2023.2 and earlier"
}

check_help_option()
{
  # 0 means true, 1 means false for boolean functions
  if [ "$1" = "-h" ] || [ "$1" = "--help" ] || [ "$1" = "-help" ] || [ "$1" = "help" ]; then
    return 0
  else
    return 1
  fi
}

register_backend() {
  case "$IDE_HOME"/ in
    "$DEFAULT_DIST"/*)
      echo "$IDE_HOME is located in default path. No need to register it."
      exit 1
    ;;
    *) # do nothing
    ;;
  esac

  link_name=$(echo -n "$IDE_HOME" | sed 's/[^a-zA-Z0-9.]/_/g')
  mkdir -p "$USER_PROVIDED_DIST"

  if [ -L "$USER_PROVIDED_DIST/$link_name" ]; then
      echo "$IDE_HOME is already registered ($USER_PROVIDED_DIST/$link_name exists)"
      exit 1
  fi

  ln -sv "$IDE_HOME" "$USER_PROVIDED_DIST/$link_name"
}

clean_up_temp()
{
  if [ -n "${TEMP_REMOTE_DEV_PROPERTIES_PATH:-}" ]; then
    rm -f "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
  fi

  if [ -n "${TEMP_REMOTE_DEV_VM_OPTIONS:-}" ]; then
    rm -f "$TEMP_REMOTE_DEV_VM_OPTIONS"
  fi

  if [ -n "${TEMP_JBR:-}" ]; then
    rm -rf "$TEMP_JBR"
  fi

  if [ -n "${TEMP_FONTS_CONFIGURATION_SOURCE_PATH:-}" ]; then
    rm -rf "$TEMP_FONTS_CONFIGURATION_SOURCE_PATH"
  fi

  if [ -n "${XVFB_PID:-}" ]; then
    kill -9 "$XVFB_PID" >/dev/null 2>&1
  fi
}

trap clean_up_temp EXIT INT HUP

if [ -n "${REMOTE_DEV_SERVER_TRACE:-}" ]; then
    set -x
fi

# ---------------------------------------------------------------------
# Check required tools.
# ---------------------------------------------------------------------

IS_DARWIN=0
case "$(uname)" in
  Darwin* )
    IS_DARWIN=1
    ;;
esac

IS_WSL2=0
if grep -q WSL2 /proc/sys/kernel/osrelease; then
  IS_WSL2=1
fi

# ---------------------------------------------------------------------
# Check if running inside Docker container
# ---------------------------------------------------------------------

IS_RUNNING_IN_DOCKER=0
is_running_in_docker()
{
  # Check cgroup content
  CGROUP_PATH="/proc/1/cgroup"
  if [ -f "$CGROUP_PATH" ]; then

    if grep -q "docker" "$CGROUP_PATH"; then
      IS_RUNNING_IN_DOCKER=1
      return
    fi

    if grep -q "lxc" "$CGROUP_PATH"; then
      IS_RUNNING_IN_DOCKER=1
      return
    fi
  fi

  # Check .dockerenv file
  DOCKER_ENV_PATH="/.dockerenv"
  if [ -f "$DOCKER_ENV_PATH" ]; then
    IS_RUNNING_IN_DOCKER=1
    return
  fi

  # Check .dockerinit file
  DOCKER_INIT_PATH="/.dockerinit"
  if [ -f "DOCKER_INIT_PATH" ]; then
    IS_RUNNING_IN_DOCKER=1
  fi
}

is_running_in_docker

# ---------------------------------------------------------------------
# Setup initial variables and validate environment state
# ---------------------------------------------------------------------

REMOTE_DEV_SERVER_BIN_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE_DEV_SERVER_DIR="$(dirname "$REMOTE_DEV_SERVER_BIN_DIR")"
PLUGINS_DIR="$(dirname "$REMOTE_DEV_SERVER_DIR")"
IDE_HOME="$(dirname "$PLUGINS_DIR")"
IDE_BIN_DIR="$IDE_HOME/bin"

DEFAULT_DIST="$HOME/.cache/JetBrains/RemoteDev/dist"
USER_PROVIDED_DIST="$HOME/.cache/JetBrains/RemoteDev/userProvidedDist"

IDE_SCRIPT_NAME="${1:-}"
IDE_PRODUCT_CODE="${2:-}"
IDE_PRODUCT_UC="${3:-}"
IDE_PRODUCT_VM_OPTIONS="${4:-}"
IDE_DEFAULT_XMX="${5:-}"

if [ -z "$IDE_SCRIPT_NAME" ] || [ -z "$IDE_PRODUCT_CODE" ] || [ -z "$IDE_PRODUCT_UC" ] || [ -z "$IDE_PRODUCT_VM_OPTIONS" ] || [ -z "$IDE_DEFAULT_XMX" ]; then
  echo "IDE script name parameter or a product code is missing. This could happen when you call this internal script directly." 1>&2
  echo "Please use wrapper script: ./bin/remote-dev-server.sh" 1>&2
  exit 1
fi

shift
shift
shift
shift
shift

STARTER_COMMAND="${1:-}"

if [ -z "$STARTER_COMMAND" ]; then
  echo "Starter command is not specified." 1>&2
  usage
  exit 1
fi

if check_help_option "$STARTER_COMMAND"; then
  usage
  exit 0
fi

if [ "$STARTER_COMMAND" = "registerBackendLocationForGateway" ]; then
  register_backend
  exit 0
fi

if [ "$STARTER_COMMAND" = "run" ]; then
  STARTER_COMMAND="remoteDevHost"
fi

if [ "$STARTER_COMMAND" = "warm-up" ]; then
  STARTER_COMMAND="warmup"
fi

if [ "$STARTER_COMMAND" = "status" ]; then
  STARTER_COMMAND="remoteDevStatus"
fi

if [ "$STARTER_COMMAND" = "invalidate-caches" ]; then
  STARTER_COMMAND="invalidateCaches"
fi

if [ "$STARTER_COMMAND" = "stop" ]; then
  STARTER_COMMAND="exit"
fi

if [ ! -d "$REMOTE_DEV_SERVER_DIR" ]; then
  echo "ERROR! Remote development is not enabled." 1>&2
  echo "Please make sure you use a correct distribution with enabled Remote Development and related libraries are included: '/plugins/remove-development/selfcontained'" 1>&2
  echo "(directory $REMOTE_DEV_SERVER_DIR is missing)"
  exit 1
fi

# Handle old names of these vars
REMOTE_DEV_NON_INTERACTIVE="${REMOTE_DEV_NON_INTERACTIVE:-${CWM_NON_INTERACTIVE:-}}"
REMOTE_DEV_TRUST_PROJECTS="${REMOTE_DEV_TRUST_PROJECTS:-${CWM_TRUST_PROJECTS:-}}"

# Check if we're running in an interactive terminal session
if ! tty -s; then
  REMOTE_DEV_NON_INTERACTIVE=1
fi

export REMOTE_DEV_NON_INTERACTIVE

# ---------------------------------------------------------------------
# Run help command after setting up libraries and fonts
# ---------------------------------------------------------------------

shift

PROJECT_PATH="${1:-}"

if check_help_option "$PROJECT_PATH"; then
  "$IDE_BIN_DIR/$IDE_SCRIPT_NAME" "remoteDevShowHelp" "$STARTER_COMMAND"
  exit 0
fi

PER_PROJECT_CONFIGS=0
if [ "${REMOTE_DEV_LEGACY_PER_PROJECT_CONFIGS:-}" = "1" ]; then
  PER_PROJECT_CONFIGS=1
  echo "Using legacy per-project config directories"
else
  echo "Using new app-level config directories"
fi

# ---------------------------------------------------------------------
# Run PROJECT_PATH checks after commands that could run without project path
# ---------------------------------------------------------------------

if [ $PER_PROJECT_CONFIGS -eq 1 ] || [ "$STARTER_COMMAND" = "warmup" ]; then
  if [ -z "$PROJECT_PATH" ]; then
    echo "Project path is not specified" 1>&2
    usage
    exit 1
  fi

  if [ ! -e "$PROJECT_PATH" ]; then
    echo "Path does not exist: $PROJECT_PATH" 1>&2
    usage
    exit 1
  fi

  shift

  if [ -d "$PROJECT_PATH" ]; then
    PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"
  else
    PROJECT_PATH="$(cd "$(dirname "$PROJECT_PATH")" && pwd)/$(basename "$PROJECT_PATH")"
  fi
fi

if [ $PER_PROJECT_CONFIGS -eq 1 ]; then
  # -----------------------------------------
  # Set default config and system directories
  # -----------------------------------------
  # /path/to/project -> _path_to_project
  PER_PROJECT_CONFIG_DIR_NAME="$(printf '%s' "$PROJECT_PATH" | sed 's|/|_|g')"

  if [ -z "${IJ_HOST_CONFIG_DIR:-}" ]; then
    IJ_HOST_CONFIG_BASE_DIR="${IJ_HOST_CONFIG_BASE_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/JetBrains}"
    if [ "${REMOTE_DEV_SYNC_CONFIG:-}" = "true" ]; then
      IJ_HOST_CONFIG_DIR_PREFIX="projects/"
    else
      IJ_HOST_CONFIG_DIR_PREFIX=""
    fi
    IJ_HOST_CONFIG_DIR="$IJ_HOST_CONFIG_BASE_DIR/RemoteDev-$IDE_PRODUCT_CODE/$IJ_HOST_CONFIG_DIR_PREFIX$PER_PROJECT_CONFIG_DIR_NAME"
  fi
  echo "IDE config directory: $IJ_HOST_CONFIG_DIR"

  if [ -z "${IJ_HOST_SYSTEM_DIR:-}" ]; then
    IJ_HOST_SYSTEM_BASE_DIR="${IJ_HOST_SYSTEM_BASE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/JetBrains}"
    IJ_HOST_SYSTEM_DIR="$IJ_HOST_SYSTEM_BASE_DIR/RemoteDev-$IDE_PRODUCT_CODE/$PER_PROJECT_CONFIG_DIR_NAME"
  fi
  echo "IDE system directory: $IJ_HOST_SYSTEM_DIR"

  # set new UI to true if there's no config
  if [ ! -d "$IJ_HOST_CONFIG_DIR" ]; then
    echo "Config folder does not exist, considering this the first launch. Will launch with New UI as default"
    REMOTE_DEV_NEW_UI_ENABLED=1
  fi

  # Create per-project config/system directories (this also prevents config import)
  mkdir -p "$IJ_HOST_CONFIG_DIR" || (echo "Failed to create $IJ_HOST_CONFIG_DIR" 1>&2; exit 1)
  mkdir -p "$IJ_HOST_SYSTEM_DIR" || (echo "Failed to create $IJ_HOST_SYSTEM_DIR" 1>&2; exit 1)

  TEMP_SYSTEM_LIKE_DIR="$IJ_HOST_SYSTEM_DIR"
else
  TEMP_SYSTEM_LIKE_DIR="${TMPDIR:-/tmp}"
fi

# ---------------------------------------------------------------------
# Configure fonts and fontconfig
# ---------------------------------------------------------------------
if [ $IS_DARWIN -ne 1 ]; then
  FONTS_CONFIGURATION_BASE_PATH="$REMOTE_DEV_SERVER_DIR/selfcontained/fontconfig"
  if [ ! -d "$FONTS_CONFIGURATION_BASE_PATH" ]; then
    echo "ERROR! Unable to locate font configuration source directory in self-contained distribution: '$FONTS_CONFIGURATION_BASE_PATH'." 1>&2
    exit 1
  fi

  TEMP_FONTS_CONFIGURATION_SOURCE_PATH="$TEMP_SYSTEM_LIKE_DIR/pid.$$.temp.fontconfig"
  rm -rf "$TEMP_FONTS_CONFIGURATION_SOURCE_PATH"
  mkdir -p "$TEMP_FONTS_CONFIGURATION_SOURCE_PATH"
  sed -e "s|PATH_FONTS|$FONTS_CONFIGURATION_BASE_PATH/fonts|" -e "s|PATH_JBR|$IDE_HOME/jbr/lib/fonts|" "$FONTS_CONFIGURATION_BASE_PATH/fonts.conf" > "$TEMP_FONTS_CONFIGURATION_SOURCE_PATH/fonts.conf"

  export INTELLIJ_ORIGINAL_ENV_FONTCONFIG_PATH="${FONTCONFIG_PATH:-}"
  if [ -z "${FONTCONFIG_PATH:-}" ]; then
    export FONTCONFIG_PATH="$TEMP_FONTS_CONFIGURATION_SOURCE_PATH"
  else
    export FONTCONFIG_PATH="$FONTCONFIG_PATH:$TEMP_FONTS_CONFIGURATION_SOURCE_PATH"
  fi

  export INTELLIJ_ORIGINAL_ENV_XDG_DATA_DIRS="${XDG_DATA_DIRS:-}"
  # fontconfig checks default fonts in "$XDG_DATA_HOME/fonts" path.
  # Set this variable to use self-contained default fonts in case no others exist.
  # Note: XDG_DATA_HOME specify a single path entry that could be re-used in IDEs.
  #       Use XDG_DATA_DIRS variable to combine with existing paths.
  if [ -z "${XDG_DATA_DIRS:-}" ]; then
    export XDG_DATA_DIRS="$TEMP_FONTS_CONFIGURATION_SOURCE_PATH"
  else
    export XDG_DATA_DIRS="$XDG_DATA_DIRS:$TEMP_FONTS_CONFIGURATION_SOURCE_PATH"
  fi
fi

# -------------------------------------------------------------------------------------
# Patch JBR to make self-contained JVM (requires nothing from host system except glibc)
# -------------------------------------------------------------------------------------

if [ -n "${REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS:-}" ]; then
  # already set by environment
  echo "\$REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS=$REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS"
elif [ $IS_DARWIN -eq 1 ]; then
  REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS=0
elif /lib64/ld-linux-x86-64.so.2 2>&1 | grep -q "gcompat ELF interpreter stub"; then
  # Not usable under Alpine and other musl-based linux distributions (x86-64)
  REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS=0
elif /lib/ld-linux-aarch64.so.1 2>&1 | grep -q "gcompat ELF interpreter stub"; then
  # Not usable under Alpine and other musl-based linux distributions (aarch64)
  REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS=0
elif /lib/ld-musl-x86_64.so.1 2>&1 | grep -q "musl libc"; then
  # Not usable under Alpine and other musl-based linux distributions (x86-64)
  REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS=0
elif /lib/ld-musl-aarch64.so.1 2>&1 | grep -q "musl libc"; then
  # Not usable under Alpine and other musl-based linux distributions (aarch64)
  REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS=0
else
  REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS=1
fi

if [ $REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS -eq 1 ]; then
  SELFCONTAINED_LIBS="$REMOTE_DEV_SERVER_DIR/selfcontained/lib"
  if [ ! -d "$SELFCONTAINED_LIBS" ]; then
    echo "ERROR! Unable to locate libraries for self-contained idea distribution. Directory not found: '$SELFCONTAINED_LIBS'." 1>&2
    exit 1
  fi

  TEMP_JBR="$TEMP_SYSTEM_LIKE_DIR/pid.$$.temp.jbr"
  rm -rf "$TEMP_JBR"
  cp -r --symbolic-link "$IDE_HOME/jbr" "$TEMP_JBR"
  find "$TEMP_JBR" -type d -exec chmod 755 {} \;

  export "${IDE_PRODUCT_UC}_JDK=$TEMP_JBR"

  patch_bin_file() {
    file="$1"
    extra_arg=""
    if [ "$(basename "$file")" = "java" ]; then
      extra_arg="\"-Djava.home=$TEMP_JBR\""
    fi
    mv "$file" "$file.bin"

    case $(uname -m) in
      x86_64)
        LD_LINUX=/lib64/ld-linux-x86-64.so.2
        ;;
      aarch64)
        LD_LINUX=/lib/ld-linux-aarch64.so.1
        ;;
      *)
        echo "Unsupported architecture $(uname -m)" 1>&2
        exit 1
        ;;
    esac

    cat >"$file" <<EOT
#!/bin/sh
exec $LD_LINUX --library-path "$SELFCONTAINED_LIBS" "${file}.bin" $extra_arg "\$@"
EOT
    chmod 755 "$file"
  }

  # Hardcoded list copied from [org.jetbrains.intellij.build.impl.BundledRuntimeImpl.executableFilesPatterns]
  find -L "$TEMP_JBR/bin" -type f -executable | while IFS= read -r line; do patch_bin_file "$line"; done
  patch_bin_file "$TEMP_JBR/lib/jexec"
  patch_bin_file "$TEMP_JBR/lib/jspawnhelper"
fi

# ---------------------------------
# Set Remote Development properties
# ---------------------------------

TEMP_REMOTE_DEV_PROPERTIES_PATH="$TEMP_SYSTEM_LIKE_DIR/pid.$$.temp.remote-dev.properties"

printf '' > "$TEMP_REMOTE_DEV_PROPERTIES_PATH"

if [ $PER_PROJECT_CONFIGS -eq 1 ]; then
  #TODO: use IDE-specific folder
  # shellcheck disable=SC2129
  # stylistic issue
  printf '\nidea.config.path=%s' "$IJ_HOST_CONFIG_DIR" >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
  printf '\nidea.plugins.path=%s' "$IJ_HOST_CONFIG_DIR/plugins" >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
  printf '\nidea.system.path=%s' "$IJ_HOST_SYSTEM_DIR" >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
  printf '\nidea.log.path=%s' "$IJ_HOST_SYSTEM_DIR/log" >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
fi

#TODO: remove once all of this is disabled for remote dev
# shellcheck disable=SC2129
# stylistic issue
printf '\nide.show.tips.on.startup.default.value=false' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
printf '\nshared.indexes.download=true' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
printf '\nshared.indexes.download.auto.consent=true' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"

# Prevent CWM plugin from being disabled, as it's required for Remote Dev
printf '\nidea.required.plugins.id=com.jetbrains.codeWithMe' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"

# Automatic updates are not supported by Remote Development
# It should be done manually by selecting correct IDE version in JetBrains Gateway
# For pre-configured environment (e.g. cloud) the version is fixed anyway
printf '\nide.no.platform.update=true' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"

#TODO: disable once IDEA doesn't require JBA login for remote dev
printf '\neap.login.enabled=false' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"

#TODO: CWM-5782 figure out why posix_spawn / jspawnhelper does not work in tests
printf '\njdk.lang.Process.launchMechanism=vfork' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
printf '\nide.ui.font.force.use.inter.font=true' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"

# IJPL-841
printf '\nidea.io.coarse.ts=true' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"

# --------------------------------
# Set Remote Development vmoptions
# --------------------------------

TEMP_REMOTE_DEV_VM_OPTIONS="$TEMP_SYSTEM_LIKE_DIR/pid.$$.temp.vmoptions"
if [ $IS_DARWIN -eq 1 ]; then
  cp "$IDE_BIN_DIR/${IDE_PRODUCT_VM_OPTIONS}.vmoptions" "$TEMP_REMOTE_DEV_VM_OPTIONS"
else
  cp "$IDE_BIN_DIR/${IDE_PRODUCT_VM_OPTIONS}64.vmoptions" "$TEMP_REMOTE_DEV_VM_OPTIONS"
fi

# [+ <IDE_HOME>.vmoptions (Toolbox style)
if [ -r "${IDE_HOME}.vmoptions" ]; then
  cat "${IDE_HOME}.vmoptions" >>"$TEMP_REMOTE_DEV_VM_OPTIONS"
else
  # Replace default (usually too small) Xmx with 2g
  # Replace only default Xmx since users may modify vmoptions file to e.g. make -Xmx even bigger
  sed "s/$IDE_DEFAULT_XMX/-Xmx2048m/g" "$TEMP_REMOTE_DEV_VM_OPTIONS" > "${TEMP_REMOTE_DEV_VM_OPTIONS}.tmp" && mv "${TEMP_REMOTE_DEV_VM_OPTIONS}.tmp" "${TEMP_REMOTE_DEV_VM_OPTIONS}"
fi

if [ $REMOTE_DEV_SERVER_USE_SELF_CONTAINED_LIBS -eq 1 ]; then
  # Since TEMP_JBR is built on symlinks, java tries to resolve it and calculates java.home incorrectly
  # Make sure java.home points to our patched JBR
  printf "\n-Djava.home=%s" "$TEMP_JBR" >> "$TEMP_REMOTE_DEV_VM_OPTIONS"
fi

if [ $IS_WSL2 -eq 1 ] && [ "${REMOTE_DEV_SERVER_ALLOW_IPV6_ON_WSL2:-}" != "true" ]; then
  printf "\n-Djava.net.preferIPv4Stack=true" >> "$TEMP_REMOTE_DEV_VM_OPTIONS"
fi

# GTW-7947 java failing to get username/home
printf "\n-Duser.home=%s" "$HOME" >> "$TEMP_REMOTE_DEV_VM_OPTIONS"

if REMOTE_DEV_USERNAME=$(id -un); then
  printf "\n-Duser.name=%s" "$REMOTE_DEV_USERNAME" >> "$TEMP_REMOTE_DEV_VM_OPTIONS"
else
  echo "Failed to retrieve username" >&2
fi

export "${IDE_PRODUCT_UC}_VM_OPTIONS=${TEMP_REMOTE_DEV_VM_OPTIONS}"

# Set to auto-configure JDK and project SDK by default if not pre-defined
if [ -n "${REMOTE_DEV_JDK_DETECTION:-}" ]; then
  if [ "${REMOTE_DEV_JDK_DETECTION:-}" = "true" ] || [ "${REMOTE_DEV_JDK_DETECTION:-}" = "1" ]; then
    echo "Enable JDK auto-detection and project SDK setup"
    printf '\njdk.configure.existing=true' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
  else
    if [ "${REMOTE_DEV_JDK_DETECTION:-}" = "false" ] || [ "${REMOTE_DEV_JDK_DETECTION:-}" = "0" ]; then
      echo "Disable JDK auto-detection and project SDK setup"
      printf '\njdk.configure.existing=false' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
    else
      echo "Unsupported value for REMOTE_DEV_JDK_DETECTION variable: ${REMOTE_DEV_JDK_DETECTION:-}"
      exit 1
    fi
  fi
else
  echo "Enable JDK auto-detection and project SDK setup by default. Set REMOTE_DEV_JDK_DETECTION=false to disable."
  printf '\njdk.configure.existing=true' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
fi

# GTW-88. Disable missing SDK notifications if launch in Docker.
echo "Is running inside Docker container: ${IS_RUNNING_IN_DOCKER}"
if [ "${IS_RUNNING_IN_DOCKER}" -eq 1 ]; then
  echo "Disable Project SDK editor notifications"
  printf '\nunknown.sdk.show.editor.actions=false' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"

  echo "Set 'remotedev.run.in.docker' registry key to 'true' to enable Remote Development project SDK notification"
  printf '\nremotedev.run.in.docker=true' >> "$TEMP_REMOTE_DEV_PROPERTIES_PATH"
fi

export "${IDE_PRODUCT_UC}_PROPERTIES=$TEMP_REMOTE_DEV_PROPERTIES_PATH"

# ---------------------------------------------------------------------
# Run the IDE.
# ---------------------------------------------------------------------

if [ $IS_DARWIN -eq 1 ]; then
  LAUNCHER="$IDE_BIN_DIR/../MacOS/$IDE_SCRIPT_NAME"
else
  LAUNCHER="$IDE_BIN_DIR/$IDE_SCRIPT_NAME"
fi

# Do not use exec here because trap is used in this script for cleanup, and exec-ing will override that
if [ $PER_PROJECT_CONFIGS -eq 1 ]; then
  case "$STARTER_COMMAND" in
    warmup)
      "$LAUNCHER" warmup "--project-dir=$PROJECT_PATH" "$@"
      ;;
    installPlugins)
      "$LAUNCHER" installPlugins "$@"
      ;;
    *)
      "$LAUNCHER" "$STARTER_COMMAND" "$PROJECT_PATH" "$@"
      ;;
  esac
else
  # for compatibility with old launcher arguments
  if [ "$STARTER_COMMAND" = "warmup" ]; then
    "$LAUNCHER" warmup "--project-dir=$PROJECT_PATH" "$@"
  else
    "$LAUNCHER" "$STARTER_COMMAND" "$@"
  fi
fi
