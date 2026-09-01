{ pkgs }: {
    deps = [
        pkgs.python311Full
        pkgs.python311Packages.pip
        pkgs.nodejs_20
        pkgs.nodePackages.npm
        pkgs.gcc
        pkgs.gnumake
    ];
    env = {
        PYTHONBIN = "${pkgs.python311Full}/bin/python3.11";
        LANG = "C.UTF-8";
    };
}
