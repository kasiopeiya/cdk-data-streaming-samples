FROM node:18.18.2-slim

# AWS CLIのインストール
RUN apt-get update && apt-get install -y unzip curl vim dpkg wget jq && \
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install && \
    export PATH="$PATH:/aws/dist" && \
    rm awscliv2.zip

# vimの設定
COPY ./script/.vimrc /root/.vimrc:ro

# CloudWatch Agent
RUN wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb && \
    dpkg -i -E amazon-cloudwatch-agent.deb && \
    rm -rf amazon-cloudwatch-agent.deb /tmp/* /var/lib/apt/lists/* /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl /opt/aws/amazon-cloudwatch-agent/bin/config-downloader
COPY ./script/cwAgent.json /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json:ro
RUN nohup /opt/aws/amazon-cloudwatch-agent/bin/start-amazon-cloudwatch-agent > /dev/null 2> /dev/null &

RUN apt-get clean && rm -rf /var/lib/apt/lists/*

CMD ["bash"]
