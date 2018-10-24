#!/bin/bash
set -e

PROFILE_D_FILE="/etc/profile.d/${productFilename}.sh"

case "$1" in
    purge|remove|upgrade|failed-upgrade|abort-install|abort-upgrade|disappear)
      echo "#!/bin/sh" > ${PROFILE_D_FILE};
      . ${PROFILE_D_FILE};
      rm ${PROFILE_D_FILE};
    ;;

    *)
      echo "postrm called with unknown argument \`$1'" >&2
      exit 1
    ;;
esac

exit 0