FROM ubuntu:24.04
ENV container=docker
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends systemd systemd-sysv dbus-user-session libpam-systemd openssh-server openjdk-21-jre-headless iproute2 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --shell /bin/bash fixture && usermod --password '*' fixture && mkdir -p /home/fixture/.ssh /srv/worldlens-acceptance /var/lib/systemd/linger && touch /var/lib/systemd/linger/fixture && chown -R fixture:fixture /home/fixture/.ssh /srv/worldlens-acceptance && chmod 700 /home/fixture/.ssh /srv/worldlens-acceptance && ssh-keygen -A
RUN printf '%s\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin no' 'AllowUsers fixture' > /etc/ssh/sshd_config.d/worldlens-fixture.conf && systemctl enable ssh.service
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
