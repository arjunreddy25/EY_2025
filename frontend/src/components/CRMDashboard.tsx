import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Users, Link2, ExternalLink, Copy, Check,
    RefreshCw, ArrowLeft, Send, Search, Filter, Mail, Trash2, FileText, AlertTriangle
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

interface LoanRecord {
    application_id: string;
    customer_id: string;
    customer_name: string;
    customer_email: string;
    amount: number;
    tenure_months: number;
    interest_rate: number;
    monthly_emi: number;
    status: string;
    sanction_letter_url?: string;
    created_at: string;
}

// Use main API server (consolidated endpoints)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function CRMDashboard() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [links, setLinks] = useState<LinkRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'customers' | 'links' | 'loans'>('customers');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [sendingEmail, setSendingEmail] = useState<string | null>(null);

    const [sendingBatch, setSendingBatch] = useState(false);
    const [deletingCustomers, setDeletingCustomers] = useState(false);
    const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [loans, setLoans] = useState<LoanRecord[]>([]);
    const [clearingData, setClearingData] = useState(false);
    const [deletingLoans, setDeletingLoans] = useState<string | null>(null);

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 4000);
    };

    const fetchCustomers = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/crm/customers`);
            const data = await response.json();
            setCustomers(data);
        } catch (error) {
            console.error('Failed to fetch customers:', error);
            showNotification('error', 'Failed to fetch customers');
        }
    }, []);

    const fetchLinks = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/crm/links`);
            const data = await response.json();
            setLinks(data);
        } catch (error) {
            console.error('Failed to fetch links:', error);
        }
    }, []);

    const fetchLoans = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/crm/loans`);
            const data = await response.json();
            setLoans(data.loans || []);
        } catch (error) {
            console.error('Failed to fetch loans:', error);
        }
    }, []);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchCustomers(), fetchLinks(), fetchLoans()]);
            setLoading(false);
        };
        loadData();
    }, [fetchCustomers, fetchLinks, fetchLoans]);

    const handleRefresh = async () => {
        setLoading(true);
        await Promise.all([fetchCustomers(), fetchLinks(), fetchLoans()]);
        setLoading(false);
    };

    const clearAllData = async () => {
        const confirmed = window.confirm(
            'This will delete ALL chat sessions, loans, and links. Customers will be kept. Continue?'
        );
        if (!confirmed) return;

        setClearingData(true);
        try {
            const response = await fetch(`${API_URL}/crm/clear-data`, { method: 'POST' });
            const data = await response.json();
            showNotification(
                'success',
                `Cleared: ${data.deleted?.chat_sessions || 0} sessions, ${data.deleted?.loan_applications || 0} loans, ${data.deleted?.customer_links || 0} links`
            );
            await Promise.all([fetchLinks(), fetchLoans()]);
        } catch (error) {
            console.error('Failed to clear data:', error);
            showNotification('error', 'Failed to clear data');
        } finally {
            setClearingData(false);
        }
    };

    const deleteCustomerLoans = async (customerId: string) => {
        const confirmed = window.confirm(`Delete all loans for this customer?`);
        if (!confirmed) return;

        setDeletingLoans(customerId);
        try {
            const response = await fetch(`${API_URL}/crm/loans/${customerId}`, { method: 'DELETE' });
            const data = await response.json();
            showNotification('success', `Deleted ${data.deleted_count} loans`);
            await fetchLoans();
        } catch (error) {
            console.error('Failed to delete loans:', error);
            showNotification('error', 'Failed to delete loans');
        } finally {
            setDeletingLoans(null);
        }
    };



    const sendEmail = async (customerId: string) => {
        setSendingEmail(customerId);
        try {
            const response = await fetch(`${API_URL}/crm/send-email/${customerId}`, {
                method: 'POST',
            });
            const data = await response.json();

            if (data.status === 'sent') {
                showNotification('success', `Email sent to ${data.email}`);
            } else {
                showNotification('error', data.message || 'Failed to send email');
            }

            await fetchLinks();
        } catch (error) {
            console.error('Failed to send email:', error);
            showNotification('error', 'Failed to send email');
        } finally {
            setSendingEmail(null);
        }
    };

    const deleteSelectedCustomers = async () => {
        if (selectedCustomers.size === 0) {
            showNotification('error', 'No customers selected for deletion');
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to DELETE ${selectedCustomers.size} customer(s)? This cannot be undone.`
        );
        if (!confirmed) return;

        setDeletingCustomers(true);
        try {
            const response = await fetch(`${API_URL}/crm/delete-customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_ids: Array.from(selectedCustomers) }),
            });
            const data = await response.json();

            showNotification(
                data.deleted > 0 ? 'success' : 'error',
                `Deleted: ${data.deleted}, Failed: ${data.failed}`
            );

            setSelectedCustomers(new Set());
            await Promise.all([fetchCustomers(), fetchLinks()]);
        } catch (error) {
            console.error('Failed to delete customers:', error);
            showNotification('error', 'Failed to delete customers');
        } finally {
            setDeletingCustomers(false);
        }
    };

    const sendBatchEmails = async () => {
        const customerIds = selectedCustomers.size > 0
            ? Array.from(selectedCustomers)
            : customers.map(c => c.customer_id);

        if (customerIds.length === 0) {
            showNotification('error', 'No customers to send emails to');
            return;
        }

        const confirmed = window.confirm(
            `Send emails to ${customerIds.length} customer(s)?`
        );
        if (!confirmed) return;

        setSendingBatch(true);
        try {
            const response = await fetch(`${API_URL}/crm/send-batch-emails`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_ids: customerIds }),
            });
            const data = await response.json();

            showNotification(
                data.sent > 0 ? 'success' : 'error',
                `Sent: ${data.sent}, Failed: ${data.failed}`
            );

            setSelectedCustomers(new Set());
            await fetchLinks();
        } catch (error) {
            console.error('Failed to send batch emails:', error);
            showNotification('error', 'Failed to send batch emails');
        } finally {
            setSendingBatch(false);
        }
    };

    const toggleSelectCustomer = (customerId: string) => {
        const newSelected = new Set(selectedCustomers);
        if (newSelected.has(customerId)) {
            newSelected.delete(customerId);
        } else {
            newSelected.add(customerId);
        }
        setSelectedCustomers(newSelected);
    };

    const selectAllCustomers = () => {
        if (selectedCustomers.size === filteredCustomers.length) {
            setSelectedCustomers(new Set());
        } else {
            setSelectedCustomers(new Set(filteredCustomers.map(c => c.customer_id)));
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
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg transition-all ${notification.type === 'success'
                    ? 'bg-green-500 text-white'
                    : 'bg-red-500 text-white'
                    }`}>
                    {notification.message}
                </div>
            )}

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

                        <div className="flex items-center gap-2">
                            {/* Bulk Actions */}
                            {selectedCustomers.size > 0 && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={deleteSelectedCustomers}
                                    disabled={deletingCustomers || loading}
                                >
                                    {deletingCustomers ? (
                                        <RefreshCw className="size-4 mr-2 animate-spin" />
                                    ) : (
                                        <Trash2 className="size-4 mr-2" />
                                    )}
                                    Delete ({selectedCustomers.size})
                                </Button>
                            )}

                            <Button
                                variant="default"
                                size="sm"
                                onClick={sendBatchEmails}
                                disabled={sendingBatch || loading}
                            >
                                {sendingBatch ? (
                                    <RefreshCw className="size-4 mr-2 animate-spin" />
                                ) : (
                                    <Mail className="size-4 mr-2" />
                                )}
                                {selectedCustomers.size > 0
                                    ? `Email Selected (${selectedCustomers.size})`
                                    : 'Email All Customers'}
                            </Button>
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
                        {activeTab === 'customers' && (
                            <Button
                                variant="outline"
                                onClick={selectAllCustomers}
                            >
                                <Check className={`size-4 mr-2 ${selectedCustomers.size === filteredCustomers.length && filteredCustomers.length > 0 ? 'opacity-100' : 'opacity-40'}`} />
                                {selectedCustomers.size === filteredCustomers.length && filteredCustomers.length > 0 ? 'Deselect All' : 'Select All'}
                            </Button>
                        )}
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
                        <Button
                            variant={activeTab === 'loans' ? 'default' : 'outline'}
                            onClick={() => setActiveTab('loans')}
                        >
                            <FileText className="size-4 mr-2" />
                            Loans ({loans.length})
                        </Button>
                        <Button
                            variant="outline"
                            className="border-red-500/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                            onClick={clearAllData}
                            disabled={clearingData}
                        >
                            {clearingData ? (
                                <RefreshCw className="size-4 mr-2 animate-spin" />
                            ) : (
                                <AlertTriangle className="size-4 mr-2" />
                            )}
                            Clear All Data
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
                                        <div className="flex flex-row items-center gap-4">
                                            {/* Checkbox */}
                                            <div className="flex items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 accent-primary cursor-pointer"
                                                    checked={selectedCustomers.has(customer.customer_id)}
                                                    onChange={() => toggleSelectCustomer(customer.customer_id)}
                                                />
                                            </div>

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
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => sendEmail(customer.customer_id)}
                                                    disabled={sendingEmail === customer.customer_id}
                                                    className="w-32"
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
                    ) : activeTab === 'links' ? (
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
                        ) : activeTab === 'loans' ? (
                            <div className="space-y-4">
                                {loans.length === 0 ? (
                                    <Card>
                                        <CardContent className="py-12 text-center text-muted-foreground">
                                            <FileText className="size-12 mx-auto mb-4 opacity-50" />
                                            <p>No loan applications yet</p>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    loans.map((loan) => (
                                        <Card key={loan.application_id}>
                                            <CardContent className="py-4">
                                                <div className="flex flex-wrap items-center justify-between gap-4">
                                                    <div className="space-y-1">
                                                        <div className="font-medium">{loan.customer_name}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {loan.customer_email}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            Application: {loan.application_id.slice(0, 12)}...
                                                        </div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="text-xl font-bold">Rs. {loan.amount.toLocaleString()}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {loan.tenure_months} months @ {loan.interest_rate}%
                                                        </div>
                                                        <div className="font-medium text-green-600">
                                                            EMI: Rs. {loan.monthly_emi.toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div className="text-center">
                                                        <span className={loan.status === 'sanctioned'
                                                            ? 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                                            : 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'}>
                                                            {loan.status}
                                                        </span>
                                                        <div className="text-xs text-muted-foreground mt-1">
                                                            {loan.created_at ? new Date(loan.created_at).toLocaleDateString() : 'N/A'}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {loan.sanction_letter_url && (
                                                            <Button size="sm" variant="outline" asChild>
                                                                <a href={loan.sanction_letter_url} target="_blank" rel="noopener noreferrer">
                                                                    <ExternalLink className="size-4 mr-2" />
                                                                    Sanction Letter
                                                                </a>
                                                            </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-red-500/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                                onClick={() => deleteCustomerLoans(loan.customer_id)}
                                                disabled={deletingLoans === loan.customer_id}
                                            >
                                                {deletingLoans === loan.customer_id ? (
                                                    <RefreshCw className="size-4" />
                                                ) : (
                                                    <Trash2 className="size-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                        )}
                    </div>
                ) : null}
            </main>
        </div>
    );
}
