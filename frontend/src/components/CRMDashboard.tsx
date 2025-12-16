import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Users, Link2, ExternalLink, Copy, Check,
    RefreshCw, ArrowLeft, Send, Search, Filter
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Customer {
    customer_id: string;
    name: string;
    email: string;
    phone: string;
    city: string;
    credit_score: number;
    pre_approved_limit: number;
}

interface GeneratedLink {
    ref_id: string;
    link: string;
    customer_id: string;
    customer_name: string;
    expires_at: string;
}

interface LinkRecord {
    ref_id: string;
    customer_id: string;
    customer_name: string;
    customer_email: string;
    link: string;
    created_at: string;
    expires_at: string;
    used: boolean;
    used_at: string | null;
}

const CRM_API_URL = 'http://localhost:8002';

export function CRMDashboard() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [links, setLinks] = useState<LinkRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'customers' | 'links'>('customers');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [sendingEmail, setSendingEmail] = useState<string | null>(null);
    const [generatingLink, setGeneratingLink] = useState<string | null>(null);

    const fetchCustomers = useCallback(async () => {
        try {
            const response = await fetch(`${CRM_API_URL}/customers`);
            const data = await response.json();
            setCustomers(data);
        } catch (error) {
            console.error('Failed to fetch customers:', error);
        }
    }, []);

    const fetchLinks = useCallback(async () => {
        try {
            const response = await fetch(`${CRM_API_URL}/links`);
            const data = await response.json();
            setLinks(data);
        } catch (error) {
            console.error('Failed to fetch links:', error);
        }
    }, []);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchCustomers(), fetchLinks()]);
            setLoading(false);
        };
        loadData();
    }, [fetchCustomers, fetchLinks]);

    const handleRefresh = async () => {
        setLoading(true);
        await Promise.all([fetchCustomers(), fetchLinks()]);
        setLoading(false);
    };

    const generateLink = async (customerId: string) => {
        setGeneratingLink(customerId);
        try {
            const response = await fetch(`${CRM_API_URL}/generate-link/${customerId}`, {
                method: 'POST',
            });
            const data: GeneratedLink = await response.json();

            // Copy to clipboard
            await navigator.clipboard.writeText(data.link);
            setCopiedId(customerId);
            setTimeout(() => setCopiedId(null), 2000);

            // Refresh links
            await fetchLinks();
        } catch (error) {
            console.error('Failed to generate link:', error);
        } finally {
            setGeneratingLink(null);
        }
    };

    const sendEmail = async (customerId: string) => {
        setSendingEmail(customerId);
        try {
            const response = await fetch(`${CRM_API_URL}/send-email/${customerId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await response.json();
            console.log('Email sent:', data);

            // Refresh links
            await fetchLinks();

            alert(`Email simulated for ${customerId}. Check server console for details.`);
        } catch (error) {
            console.error('Failed to send email:', error);
        } finally {
            setSendingEmail(null);
        }
    };

    const copyLink = async (link: string, refId: string) => {
        await navigator.clipboard.writeText(link);
        setCopiedId(refId);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const filteredCustomers = customers.filter(customer =>
        customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.customer_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.city.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredLinks = links.filter(link =>
        link.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        link.customer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        link.customer_id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString();
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <a
                                href="/"
                                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <ArrowLeft className="size-4" />
                                <span className="text-sm">Back to Chat</span>
                            </a>
                            <div className="h-6 w-px bg-border" />
                            <div className="flex items-center gap-2">
                                <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                    <Users className="size-4" />
                                </div>
                                <h1 className="text-xl font-semibold">CRM Dashboard</h1>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={loading}
                        >
                            <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Customers</CardDescription>
                            <CardTitle className="text-3xl">{customers.length}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Links Generated</CardDescription>
                            <CardTitle className="text-3xl">{links.length}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Links Used</CardDescription>
                            <CardTitle className="text-3xl">{links.filter(l => l.used).length}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Pending Links</CardDescription>
                            <CardTitle className="text-3xl">{links.filter(l => !l.used).length}</CardTitle>
                        </CardHeader>
                    </Card>
                </div>

                {/* Search and Tabs */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, email, ID, or city..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant={activeTab === 'customers' ? 'default' : 'outline'}
                            onClick={() => setActiveTab('customers')}
                        >
                            <Users className="size-4 mr-2" />
                            Customers
                        </Button>
                        <Button
                            variant={activeTab === 'links' ? 'default' : 'outline'}
                            onClick={() => setActiveTab('links')}
                        >
                            <Link2 className="size-4 mr-2" />
                            Generated Links
                        </Button>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="size-8 animate-spin text-muted-foreground" />
                    </div>
                ) : activeTab === 'customers' ? (
                    <div className="grid gap-4">
                        {filteredCustomers.length === 0 ? (
                            <Card>
                                <CardContent className="py-12 text-center text-muted-foreground">
                                    <Filter className="size-12 mx-auto mb-4 opacity-50" />
                                    <p>No customers found matching "{searchQuery}"</p>
                                </CardContent>
                            </Card>
                        ) : (
                            filteredCustomers.map((customer) => (
                                <Card key={customer.customer_id} className="hover:shadow-md transition-shadow">
                                    <CardContent className="p-4">
                                        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                            {/* Customer Info */}
                                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Customer</p>
                                                    <p className="font-medium">{customer.name}</p>
                                                    <p className="text-sm text-muted-foreground">{customer.customer_id}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Contact</p>
                                                    <p className="text-sm">{customer.email}</p>
                                                    <p className="text-sm text-muted-foreground">{customer.phone}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Location</p>
                                                    <p className="text-sm">{customer.city}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Pre-Approved</p>
                                                    <p className="font-medium text-green-600 dark:text-green-400">
                                                        {formatCurrency(customer.pre_approved_limit)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Score: {customer.credit_score}</p>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2 lg:flex-col">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => generateLink(customer.customer_id)}
                                                    disabled={generatingLink === customer.customer_id}
                                                    className="flex-1"
                                                >
                                                    {generatingLink === customer.customer_id ? (
                                                        <RefreshCw className="size-4 mr-2 animate-spin" />
                                                    ) : copiedId === customer.customer_id ? (
                                                        <Check className="size-4 mr-2 text-green-500" />
                                                    ) : (
                                                        <Link2 className="size-4 mr-2" />
                                                    )}
                                                    {copiedId === customer.customer_id ? 'Copied!' : 'Generate Link'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => sendEmail(customer.customer_id)}
                                                    disabled={sendingEmail === customer.customer_id}
                                                    className="flex-1"
                                                >
                                                    {sendingEmail === customer.customer_id ? (
                                                        <RefreshCw className="size-4 mr-2 animate-spin" />
                                                    ) : (
                                                        <Send className="size-4 mr-2" />
                                                    )}
                                                    Send Email
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                ) : (
                    /* Links Tab */
                    <div className="grid gap-4">
                        {filteredLinks.length === 0 ? (
                            <Card>
                                <CardContent className="py-12 text-center text-muted-foreground">
                                    <Link2 className="size-12 mx-auto mb-4 opacity-50" />
                                    <p>No links generated yet</p>
                                    <p className="text-sm mt-2">Go to Customers tab to generate links</p>
                                </CardContent>
                            </Card>
                        ) : (
                            filteredLinks.map((link) => (
                                <Card
                                    key={link.ref_id}
                                    className={`hover:shadow-md transition-shadow ${link.used ? 'opacity-60' : ''}`}
                                >
                                    <CardContent className="p-4">
                                        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                            {/* Link Info */}
                                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Customer</p>
                                                    <p className="font-medium">{link.customer_name}</p>
                                                    <p className="text-sm text-muted-foreground">{link.customer_id}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Reference ID</p>
                                                    <p className="font-mono text-sm">{link.ref_id}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Created</p>
                                                    <p className="text-sm">{formatDate(link.created_at)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
                                                    {link.used ? (
                                                        <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                                                            <Check className="size-3" />
                                                            Used {link.used_at && `at ${formatDate(link.used_at)}`}
                                                        </span>
                                                    ) : (
                                                        <span className="text-sm text-amber-600 dark:text-amber-400">
                                                            Pending (expires {formatDate(link.expires_at)})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => copyLink(link.link, link.ref_id)}
                                                >
                                                    {copiedId === link.ref_id ? (
                                                        <Check className="size-4 mr-2 text-green-500" />
                                                    ) : (
                                                        <Copy className="size-4 mr-2" />
                                                    )}
                                                    {copiedId === link.ref_id ? 'Copied!' : 'Copy Link'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    asChild
                                                >
                                                    <a href={link.link} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink className="size-4 mr-2" />
                                                        Open
                                                    </a>
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
