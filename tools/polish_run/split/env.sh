# sets D (crops), L (layout), PDF for split sessions M/P
IN=/mnt/user-data/uploads/Downloads/icfes-azure-input
D=/home/claude/work/split/crops/${e}_${s}; L=$D.layout.json
case $e in M) PDF="$IN/S11- M  1ra sesion y 2da sesion.pdf";; P) PDF="$IN/S11- P    1era y 2da sesion.pdf";; esac
